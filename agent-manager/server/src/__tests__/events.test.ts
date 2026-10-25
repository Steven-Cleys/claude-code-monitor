import { test, expect } from "bun:test";
import { eventsRouter } from "../routes/events";

test("rejects an event id beyond Postgres' integer range before querying", async () => {
  const res = await eventsRouter.request("/2147483648");

  expect(res.status).toBe(400);
});

test("rejects a since param that is not a date", async () => {
  const res = await eventsRouter.request("/?since=yesterday");

  expect(res.status).toBe(400);
});
