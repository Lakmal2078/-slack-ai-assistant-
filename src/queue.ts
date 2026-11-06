import { Queue } from "bullmq";
import { redis } from "./redis.js";

export interface SlackMessageJob {
  workspaceId: string;
  channelId: string;
  userId: string;
  text: string;
  threadTs: string;
  eventId: string;
}

export const messageQueue = new Queue<SlackMessageJob>("slack-messages", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1500 },
    removeOnComplete: 1000,
    removeOnFail: 5000
  }
});
