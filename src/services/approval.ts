import { prisma } from "../db.js";
import { env } from "../config/env.js";

export async function createApproval(input: {
  workspaceId: string;
  requesterId: string;
  channelId: string;
  threadTs: string;
  toolName: string;
  arguments: unknown;
}) {
  const expiresAt = new Date(Date.now() + env.APPROVAL_TTL_HOURS * 60 * 60 * 1000);
  return prisma.approval.create({
    data: {
      workspaceId: input.workspaceId,
      requesterId: input.requesterId,
      channelId: input.channelId,
      threadTs: input.threadTs,
      toolName: input.toolName,
      arguments: JSON.parse(JSON.stringify(input.arguments)),
      expiresAt
    }
  });
}
