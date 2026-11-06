import OpenAI from "openai";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { getTool, tools, type ToolContext } from "./tools.js";
import { logger } from "../config/logger.js";
import { WebClient } from "@slack/web-api";
import { createApproval } from "../services/approval.js";

const slackClient = new WebClient(env.SLACK_BOT_TOKEN);

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

type AgentInput = ToolContext & { text: string };

export async function runAgent(input: AgentInput): Promise<string> {
  const conversation = await prisma.conversation.upsert({
    where: {
      workspaceId_channelId_threadTs: {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        threadTs: input.threadTs
      }
    },
    create: {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      threadTs: input.threadTs,
      userId: input.userId
    },
    update: { updatedAt: new Date() }
  });

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 12
  });

  const memories = await prisma.memory.findMany({
    where: { workspaceId: input.workspaceId, userId: input.userId },
    orderBy: { updatedAt: "desc" },
    take: 8
  });

  const inputItems: OpenAI.Responses.ResponseInputItem[] = [
    ...history.reverse().map(message => ({
      role: (message.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: message.content
    })),
    {
      role: "user",
      content: [
        ...(memories.length ? [{ type: "input_text" as const, text: `User-approved memory:\n${memories.map(m => m.content).join("\n")}` }] : []),
        { type: "input_text" as const, text: input.text }
      ]
    }
  ];

  await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      role: "user",
      content: input.text
    }
  });

  let response = await openai.responses.create({
    model: env.OPENAI_MODEL,
    instructions: SYSTEM_PROMPT,
    input: inputItems,
    tools: tools.map(tool => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true
    }))
  });

  for (let round = 0; round < env.MAX_TOOL_ROUNDS; round++) {
    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call"
    );
    if (calls.length === 0) break;

    const outputs: OpenAI.Responses.ResponseInputItem[] = [];
    for (const call of calls) {
      const tool = getTool(call.name);
      if (!tool) {
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "Unknown tool" }) });
        continue;
      }

      try {
        const args = tool.validate(JSON.parse(call.arguments));
        if (tool.requiresApproval) {
          const approval = await createApproval({
            workspaceId: input.workspaceId,
            requesterId: input.userId,
            channelId: input.channelId,
            threadTs: input.threadTs,
            toolName: tool.name,
            arguments: args
          });
          await slackClient.chat.postMessage({
            channel: input.channelId,
            ...(input.threadTs.match(/^\\d+\\.\\d+$/) ? { thread_ts: input.threadTs } : {}),
            text: `අනුමැතිය අවශ්‍යයි: ${tool.name}`,
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: `*අනුමැතිය අවශ්‍යයි*\\nAI Assistant විසින් Slack පණිවිඩයක් යැවීමට ඉල්ලීමක් කර ඇත.\\n\\n>${String((args as { text: string }).text).replace(/\\n/g, "\\n> ")}` }
              },
              {
                type: "actions",
                elements: [
                  { type: "button", text: { type: "plain_text", text: "Approve" }, style: "primary", action_id: `approval_approve_${approval.id}` },
                  { type: "button", text: { type: "plain_text", text: "Reject" }, style: "danger", action_id: `approval_reject_${approval.id}` }
                ]
              }
            ]
          });
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({
              approvalRequired: true,
              approvalId: approval.id,
              message: "Approval request posted to Slack. Do not execute the action until approval is confirmed."
            })
          });
          continue;
        }

        const result = await tool.execute(args, input);
        await prisma.toolCall.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            toolName: tool.name,
            arguments: args,
            status: "SUCCEEDED",
            result: JSON.parse(JSON.stringify(result))
          }
        });
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
      } catch (error) {
        logger.warn({ err: error, tool: call.name }, "Tool execution failed");
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ error: "Tool input invalid or execution failed." })
        });
      }
    }

    response = await openai.responses.create({
      model: env.OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      previous_response_id: response.id,
      input: outputs,
      tools: tools.map(tool => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: true
      }))
    });
  }

  const answer = response.output_text || "මට මේ අවස්ථාවේ පිළිතුරක් සකස් කිරීමට නොහැකි වුණා.";
  await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      role: "assistant",
      content: answer
    }
  });
  return answer;
}
