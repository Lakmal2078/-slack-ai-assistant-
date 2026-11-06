import { describe, expect, it } from "vitest";
import { getTool } from "./tools.js";

describe("tool registry", () => {
  it("exposes the approval-gated Slack posting tool", () => {
    const tool = getTool("post_slack_message");
    expect(tool).toBeDefined();
    expect(tool?.requiresApproval).toBe(true);
  });

  it("rejects invalid tool arguments", () => {
    const tool = getTool("post_slack_message");
    expect(() => tool?.validate({ text: "" })).toThrow();
  });
});
