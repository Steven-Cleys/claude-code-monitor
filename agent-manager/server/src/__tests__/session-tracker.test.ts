import { test, expect, mock, spyOn } from "bun:test";

mock.module("../db/connection", () => ({
  sql: () => Promise.reject(new Error("connection refused")),
}));
const { startSessionTracker } = await import("../services/session-tracker");

test("a failed idle query is logged instead of crashing the server", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const stop = startSessionTracker(() => {}, 1);

  await new Promise((resolve) => setTimeout(resolve, 20));
  stop();

  expect(logged).toHaveBeenCalled();
  logged.mockRestore();
});
