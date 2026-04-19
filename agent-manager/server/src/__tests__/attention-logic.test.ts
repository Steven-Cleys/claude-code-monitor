import { test, expect, describe } from "bun:test";
import {
  shouldTriggerAttention,
  shouldClearAttention,
} from "../services/attention-logic";

describe("shouldTriggerAttention", () => {
  test("returns true for permission_prompt notification", () => {
    expect(
      shouldTriggerAttention({
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
      }),
    ).toBe(true);
  });

  test("returns true for idle_prompt notification", () => {
    expect(
      shouldTriggerAttention({
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
      }),
    ).toBe(true);
  });

  test("returns false for auth_success notification", () => {
    expect(
      shouldTriggerAttention({
        hook_event_name: "Notification",
        notification_type: "auth_success",
      }),
    ).toBe(false);
  });

  test("returns false for unknown notification_type", () => {
    expect(
      shouldTriggerAttention({
        hook_event_name: "Notification",
        notification_type: "something_new",
      }),
    ).toBe(false);
  });

  test("returns false when notification_type is missing", () => {
    expect(
      shouldTriggerAttention({ hook_event_name: "Notification" }),
    ).toBe(false);
  });

  test("returns false for non-Notification hook events", () => {
    expect(
      shouldTriggerAttention({
        hook_event_name: "PreToolUse",
        notification_type: "permission_prompt",
      }),
    ).toBe(false);
  });
});

describe("shouldClearAttention", () => {
  test("returns true for PreToolUse", () => {
    expect(shouldClearAttention({ hook_event_name: "PreToolUse" })).toBe(true);
  });

  test("returns true for PostToolUse", () => {
    expect(shouldClearAttention({ hook_event_name: "PostToolUse" })).toBe(true);
  });

  test("returns true for Stop", () => {
    expect(shouldClearAttention({ hook_event_name: "Stop" })).toBe(true);
  });

  test("returns true for SessionEnd", () => {
    expect(shouldClearAttention({ hook_event_name: "SessionEnd" })).toBe(true);
  });

  test("returns false for Notification", () => {
    expect(
      shouldClearAttention({ hook_event_name: "Notification" }),
    ).toBe(false);
  });

  test("returns false for SessionStart", () => {
    expect(
      shouldClearAttention({ hook_event_name: "SessionStart" }),
    ).toBe(false);
  });
});
