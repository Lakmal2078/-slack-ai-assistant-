import type { App } from "@slack/bolt";
import { messageQueue } from "../queue.js";
import { logger } from "../config/logger.js";
import { workspaceAllowed, truncateMessage } from "../security.js";
import { prisma } from "../db.js";
import { createApproval } from "../services/approval.js";
import { getTool } from "../agent/tools.js";
import { env } from "../config/env.js";

export function registerSlackHandlers(app: App): void {
  app.event("app_mention", async ({ event, body }) => {
    const teamId = body.team_id;
    if (!teamId || !workspaceAllowed(teamId)) return;
    const userId = event.user;
    if (!userId || event.bot_id) return;

    const text = truncateMessage(event.text.replace(/<@[^>]+>/g, "").trim());
    if (!text) return;

    const threadTs = event.thread_ts ?? event.ts;
    await messageQueue.add("process", {
      workspaceId: teamId,
      channelId: event.channel,
      userId,
      text,
      threadTs,
      eventId: body.event_id
    }, { jobId: body.event_id });
  });

  app.message(async ({ message, body, say, client }) => {
    if (!("channel_type" in message) || message.channel_type !== "im") return;
    if (!("user" in message) || !message.user || ("bot_id" in message && message.bot_id)) return;
    if (!("text" in message) || !message.text?.trim()) return;

    const teamId = body.team_id;
    if (!teamId || !workspaceAllowed(teamId)) return;
    const threadTs = "thread_ts" in message && message.thread_ts ? message.thread_ts : message.ts;
    const text = truncateMessage(message.text);

    await messageQueue.add("process", {
      workspaceId: teamId,
      channelId: message.channel,
      userId: message.user,
      text,
      threadTs,
      eventId: `${teamId}:${message.channel}:${message.ts}`
    }, { jobId: `${teamId}-${message.channel}-${message.ts}` });

    await say({ text: "මම ඔබගේ පණිවිඩය සකස් කරමින් සිටිමි…", thread_ts: threadTs });
  });

  app.command("/assistant", async ({ command, ack, respond, body }) => {
    await ack();
    const teamId = body.team_id;
    if (!teamId || !workspaceAllowed(teamId)) {
      await respond({ text: "මෙම workspace එකට අවසර නැත.", response_type: "ephemeral" });
      return;
    }
    const text = truncateMessage(command.text.trim());
    if (!text) {
      await respond({ text: "භාවිතය: `/assistant ඔබේ ප්‍රශ්නය`", response_type: "ephemeral" });
      return;
    }
    await messageQueue.add("process", {
      workspaceId: teamId,
      channelId: command.channel_id,
      userId: command.user_id,
      text,
      threadTs: command.trigger_id,
      eventId: `cmd:${command.trigger_id}`
    });
    await respond({ text: "ඔබගේ ඉල්ලීම සකස් කරමින් සිටිමි.", response_type: "ephemeral" });
  });

  app.action(/^approval_(approve|reject)_(.+)$/, async ({ ack, body, action, client }) => {
    await ack();
    const match = action.action_id.match(/^approval_(approve|reject)_(.+)$/);
    if (!match || !("user" in body)) return;
    const [, decision, approvalId] = match;
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.status !== "PENDING" || approval.expiresAt < new Date()) return;
    if (approval.requesterId !== body.user.id) {
      await client.chat.postEphemeral({
        channel: approval.channelId,
        user: body.user.id,
        text: "මෙම approval එක ඉල්ලා සිටි පරිශීලකයාට පමණක් එය තීරණය කළ හැකියි."
      });
      return;
    }
    const updated = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        reviewedBy: body.user.id,
        reviewedAt: new Date()
      }
    });

    if (decision === "approve") {
      if (approval.toolName !== "post_slack_message") {
        await prisma.approval.update({ where: { id: approvalId }, data: { status: "FAILED" } });
        await client.chat.postMessage({ channel: approval.channelId, text: "මෙම tool එකට approved executor එකක් සකස් කර නැත." });
        return;
      }
      const args = approval.arguments as { text?: unknown };
      if (typeof args.text !== "string" || args.text.length < 1 || args.text.length > 3000) {
        await prisma.approval.update({ where: { id: approvalId }, data: { status: "FAILED" } });
        return;
      }
      try {
        const result = await client.chat.postMessage({
          channel: approval.channelId,
          ...(approval.threadTs.match(/^\\d+\\.\\d+$/) ? { thread_ts: approval.threadTs } : {}),
          text: args.text
        });
        await prisma.toolCall.create({
          data: {
            workspaceId: approval.workspaceId,
            userId: approval.requesterId,
            toolName: approval.toolName,
            arguments: approval.arguments as object,
            status: "SUCCEEDED",
            result: { channel: result.channel, ts: result.ts }
          }
        });
        await prisma.approval.update({
          where: { id: approvalId },
          data: { status: "EXECUTED", result: { channel: result.channel, ts: result.ts } }
        });
        await client.chat.postMessage({
          channel: approval.channelId,
          ...(approval.threadTs.match(/^\\d+\\.\\d+$/) ? { thread_ts: approval.threadTs } : {}),
          text: "අනුමත ක්‍රියාව සාර්ථකව ක්‍රියාත්මක කළා."
        });
      } catch (error) {
        await prisma.approval.update({ where: { id: approvalId }, data: { status: "FAILED" } });
        await client.chat.postMessage({ channel: approval.channelId, text: "අනුමත ක්‍රියාව ක්‍රියාත්මක කිරීම අසාර්ථක විය." });
        logger.error({ err: error, approvalId }, "Approved action failed");
      }
    } else {
      await client.chat.postMessage({
        channel: approval.channelId,
        ...(approval.threadTs.match(/^\\d+\\.\\d+$/) ? { thread_ts: approval.threadTs } : {}),
        text: "ක්‍රියාව ප්‍රතික්ෂේප කරන ලදී."
      });
    }
  });
}
