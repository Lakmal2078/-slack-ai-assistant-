import { App } from "@slack/bolt";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { registerSlackHandlers } from "./slack/register.js";
import { messageWorker } from "./worker.js";
import { redis } from "./redis.js";
import { prisma } from "./db.js";

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: env.SLACK_SOCKET_MODE,
  ...(env.SLACK_SOCKET_MODE && env.SLACK_APP_TOKEN ? { appToken: env.SLACK_APP_TOKEN } : {}),
  port: env.PORT
});

registerSlackHandlers(app);

async function start(): Promise<void> {
  await app.start();
  logger.info({ port: env.PORT, socketMode: env.SLACK_SOCKET_MODE }, "Slack AI Assistant started");
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  await app.stop();
  await messageWorker.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch(error => {
  logger.fatal({ err: error }, "Startup failed");
  process.exit(1);
});
