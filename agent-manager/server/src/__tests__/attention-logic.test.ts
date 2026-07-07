import { test, expect, describe } from "bun:test";
import { shouldClearAttention, shouldTriggerAttention } from "../services/attention-logic";

describe("shouldClearAttention", () => {
  test("clears on turn-end, session-end, tool activity, and user prompt", () => {
    for (const name of ["Stop", "StopFailure", "SessionEnd", "PreToolUse", "PostToolUse", "UserPromptSubmit"]) {
      expect(shouldClearAttention({ hook_event_name: name })).toBe(true);
    }
  });

  test("does not clear on passive events", () => {
    for (const name of ["Notification", "SubagentStop", "SessionStart"]) {
      expect(shouldClearAttention({ hook_event_name: name })).toBe(false);
    }
  });
});

describe("shouldTriggerAttention", () => {
  test("triggers only on permission_prompt / idle_prompt notifications", () => {
    expect(shouldTriggerAttention({ hook_event_name: "Notification", notification_type: "permission_prompt" })).toBe(true);
    expect(shouldTriggerAttention({ hook_event_name: "Notification", notification_type: "auth_success" })).toBe(false);
    expect(shouldTriggerAttention({ hook_event_name: "Stop" })).toBe(false);
  });
});
