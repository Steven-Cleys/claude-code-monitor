import { test, expect } from "bun:test";
import { taskNotificationSummary } from "../format";

test("reads the summary of a background agent's completion notice", () => {
  const notice = '<task-notification>\n<task-id>a4f0</task-id>\n<summary>Agent "Review" finished</summary>\n</task-notification>';

  expect(taskNotificationSummary(notice)).toBe('Agent "Review" finished');
});

test("returns null for a normal prompt", () => {
  expect(taskNotificationSummary("fix the cart totals")).toBeNull();
});
