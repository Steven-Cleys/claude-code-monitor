import { test, expect, afterEach, spyOn } from "bun:test";
import { createSessionsRouter } from "../routes/sessions";
import * as sessionTracker from "../services/session-tracker";

let spies: { mockRestore(): void }[] = [];

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

async function requestedHours(query: string) {
  const list = spyOn(sessionTracker, "listRecentSessions").mockResolvedValue(
    [] as unknown as Awaited<ReturnType<typeof sessionTracker.listRecentSessions>>,
  );
  spies.push(list);

  const res = await createSessionsRouter(() => {}).request(`/${query}`);

  expect(res.status).toBe(200);
  return list.mock.calls[0]![0];
}

test("lists the last 4 hours by default", async () => {
  expect(await requestedHours("")).toBe(4);
});

test("clamps the hours param to one week", async () => {
  expect(await requestedHours("?hours=9999")).toBe(168);
});

test("falls back to the default for a non-numeric hours param", async () => {
  expect(await requestedHours("?hours=abc")).toBe(4);
});
