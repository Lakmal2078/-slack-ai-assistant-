import { Worker } from "bullmq";
import { WebClient } from "@slack/web-api";
import { redis } from "./redis.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { runAgent } from "./agent/runtime.js";
import { prisma } from "./db.js";
import { createApproval } from "./services/approval.js";

const slack = new WebClient(env.SLACK_BOT_TOKEN);

export const messageWorker = new Worker("slack-messages", async job => {
  const { workspaceId, channelId, userId, text, threadTs } = job.data;

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    create: { id: workspaceId },
    update: {}
  });
  await prisma.user.upsert({
    where: { id_workspaceId: { id: userId, workspaceId } },
    create: { id: userId, workspaceId },
    update: {}
  });

  const answer = await runAgent({ workspaceId, channelId, userId, threadTs, text });
  await slack.chat.postMessage({
    channel: channelId,
    ...(threadTs.match(/^\\d+\\.\\d+$/) ? { thread_ts: threadTs } : {}),
    text: answer,
    mrkdwn: true
  });
}, {
  connection: redis,
  concurrency: 5
});

messageWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error }, "Slack message job failed");
});
