import { timingSafeEqual } from "node:crypto";
import { env, allowedWorkspaceIds } from "./config/env.js";

export function workspaceAllowed(teamId: string): boolean {
  return allowedWorkspaceIds.size === 0 || allowedWorkspaceIds.has(teamId);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function truncateMessage(text: string): string {
  return text.slice(0, env.MAX_MESSAGE_CHARS);
}
