import { z } from "zod";

export type ToolContext = {
  workspaceId: string;
  userId: string;
  channelId: string;
  threadTs: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  validate: (input: unknown) => unknown;
  execute: (input: any, context: ToolContext) => Promise<unknown>;
};

const searchSchema = z.object({ query: z.string().min(2).max(500) });

export const tools: ToolDefinition[] = [
  {
    name: "search_workspace_messages",
    description: "Search messages visible to the Slack bot in the current conversation context. This MVP uses only the current thread history; it does not search all workspace channels.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search phrase" } },
      required: ["query"],
      additionalProperties: false
    },
    requiresApproval: false,
    validate: value => searchSchema.parse(value),
    execute: async (_input, context) => ({
      note: "Workspace-wide search is not enabled in this MVP.",
      channelId: context.channelId
    })
  },
  {
    name: "post_slack_message",
    description: "Post a message to the current Slack channel. Requires user approval.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: 3000 } },
      required: ["text"],
      additionalProperties: false
    },
    requiresApproval: true,
    validate: value => z.object({ text: z.string().min(1).max(3000) }).parse(value),
    execute: async (input, context) => {
      // Execution is injected by the Slack worker to avoid coupling the registry to a WebClient.
      return { pendingExecution: true, text: input.text, channelId: context.channelId };
    }
  }
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(tool => tool.name === name);
}
