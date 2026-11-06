import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_SOCKET_MODE: z.string().default("true").transform(v => v === "true"),
  SLACK_APP_TOKEN: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APPROVAL_TTL_HOURS: z.coerce.number().int().positive().default(24),
  MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(10).default(5),
  MAX_MESSAGE_CHARS: z.coerce.number().int().positive().default(12000),
  ALLOWED_WORKSPACE_IDS: z.string().default("")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
export const allowedWorkspaceIds = new Set(
  env.ALLOWED_WORKSPACE_IDS.split(",").map(v => v.trim()).filter(Boolean)
);
