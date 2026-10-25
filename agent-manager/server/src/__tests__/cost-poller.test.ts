import { test, expect, describe, afterEach, spyOn } from "bun:test";
import { parseCostVector, liveDays, backfillDays, oldestDataDay, createCostPoll } from "../services/cost-poller";

const DAY = 86_400_000;
const OCT_20 = Date.UTC(2026, 9, 20);

function vector(result: { session_id?: string; value: string }[]) {
  return {
    status: "success",
    data: {
      resultType: "vector",
      result: result.map(({ session_id, value }) => ({
        metric: session_id ? { session_id } : {},
        value: [1792930544.5, value],
      })),
    },
  };
}

describe("parseCostVector", () => {
  test("maps each session to its cost", () => {
    const costs = parseCostVector(vector([
      { session_id: "sess-1", value: "1.25" },
      { session_id: "sess-2", value: "0.004" },
    ]));

    expect(costs).toEqual(new Map([["sess-1", 1.25], ["sess-2", 0.004]]));
  });

  test("skips results without a session id or with a non-finite value", () => {
    const costs = parseCostVector(vector([
      { value: "3" },
      { session_id: "sess-nan", value: "NaN" },
      { session_id: "sess-ok", value: "2" },
    ]));

    expect(costs).toEqual(new Map([["sess-ok", 2]]));
  });

  test("throws on a Loki error response", () => {
    expect(() => parseCostVector({ status: "error", error: "bad query" })).toThrow("bad query");
  });
});

describe("liveDays", () => {
  test("recomputes only today during the day", () => {
    expect(liveDays(OCT_20 + 12 * 3600_000)).toEqual([OCT_20]);
  });

  test("also recomputes yesterday right after midnight, for late events", () => {
    expect(liveDays(OCT_20 + 60_000)).toEqual([OCT_20 - DAY, OCT_20]);
  });
});

describe("backfillDays", () => {
  test("covers every closed day from the oldest session's day", () => {
    expect(backfillDays(OCT_20 - 2 * DAY + 5 * 3600_000, OCT_20 + 3600_000))
      .toEqual([OCT_20 - 2 * DAY, OCT_20 - DAY]);
  });

  test("is empty when the oldest session started today", () => {
    expect(backfillDays(OCT_20 + 60_000, OCT_20 + 3600_000)).toEqual([]);
  });
});

describe("Loki", () => {
  let server: ReturnType<typeof Bun.serve> | undefined;
  afterEach(() => server?.stop(true));

  // Days with log entries at all (for index/stats) and the cost each query
  // returns, keyed by the query's evaluation time.
  function fakeLoki({ hasData = () => true, cost = () => [] as { session_id: string; value: string }[], down = () => false }: {
    hasData?: (start: number, end: number) => boolean;
    cost?: (time: number) => { session_id: string; value: string }[];
    down?: () => boolean;
  }) {
    const queries: { time: number; range: string }[] = [];
    const stats: { start: number; end: number }[] = [];
    server = Bun.serve({
      port: 0,
      fetch(req) {
        if (down()) return new Response("unavailable", { status: 503 });
        const url = new URL(req.url);
        const params = url.searchParams;
        if (url.pathname.endsWith("/index/stats")) {
          const start = Number(params.get("start")) * 1000;
          const end = Number(params.get("end")) * 1000;
          stats.push({ start, end });
          return Response.json({ entries: hasData(start, end) ? 42 : 0 });
        }
        const time = Number(params.get("time")) * 1000;
        queries.push({ time, range: params.get("query")?.match(/\[(\d+s)\]/)?.[1] ?? "" });
        return Response.json(vector(cost(time)));
      },
    });
    return { url: `http://localhost:${server.port}`, queries, stats };
  }

  describe("oldestDataDay", () => {
    test("walks back in 30-day windows to the last one holding data", async () => {
      const now = OCT_20 + 3600_000;
      const loki = fakeLoki({ hasData: (_, end) => end > now - 40 * DAY });

      expect(await oldestDataDay(loki.url, OCT_20 - 2 * DAY, now)).toBe(OCT_20 - 60 * DAY);
      expect(loki.stats).toHaveLength(3);
    });

    test("keeps walking past empty windows until it is older than the oldest session", async () => {
      const now = OCT_20 + 3600_000;
      const overlaps = (start: number, end: number, from: number, to: number) => start < to && end > from;
      const loki = fakeLoki({
        hasData: (start, end) => overlaps(start, end, now - 10 * DAY, now) || overlaps(start, end, now - 75 * DAY, now - 70 * DAY),
      });

      expect(await oldestDataDay(loki.url, now - 80 * DAY, now)).toBe(OCT_20 - 90 * DAY);
    });
  });

  describe("createCostPoll", () => {
    test("backfills each closed day once, then recomputes today", async () => {
      const now = OCT_20 + 3600_000;
      const loki = fakeLoki({
        hasData: (_, end) => end > OCT_20 - 2 * DAY,
        cost: (time) =>
          time === now ? [{ session_id: "sess-1", value: "0.5" }]
          : time >= OCT_20 - DAY ? [{ session_id: "sess-1", value: "2" }]
          : [],
      });
      const stored: { session_id: string; day: string; cost: number }[][] = [];
      const poll = createCostPoll(loki.url, {
        oldestSessionStart: async () => OCT_20 - 2 * DAY,
        store: async (rows) => { stored.push(rows); },
        now: () => now,
      });

      await poll();
      await poll();

      const backfill = loki.queries.slice(0, -2);
      expect(backfill[0]).toEqual({ time: OCT_20 - 29 * DAY, range: "86400s" });
      expect(backfill.at(-1)).toEqual({ time: OCT_20, range: "86400s" });
      expect(loki.queries.slice(-2)).toEqual([{ time: now, range: "3600s" }, { time: now, range: "3600s" }]);
      expect(stored).toEqual([
        [
          { session_id: "sess-1", day: "2026-10-18", cost: 2 },
          { session_id: "sess-1", day: "2026-10-19", cost: 2 },
        ],
        [{ session_id: "sess-1", day: "2026-10-20", cost: 0.5 }],
        [{ session_id: "sess-1", day: "2026-10-20", cost: 0.5 }],
      ]);
    });

    test("skips the backfill when there are no sessions", async () => {
      const loki = fakeLoki({});
      const poll = createCostPoll(loki.url, {
        oldestSessionStart: async () => null,
        store: async () => {},
        now: () => OCT_20 + 3600_000,
      });

      await poll();

      expect(loki.stats).toEqual([]);
      expect(loki.queries).toEqual([{ time: OCT_20 + 3600_000, range: "3600s" }]);
    });

    test("logs an outage once and retries the backfill after it", async () => {
      let up = false;
      const loki = fakeLoki({ hasData: (_, end) => end > OCT_20 - DAY, down: () => !up });
      const warn = spyOn(console, "warn").mockImplementation(() => {});
      const poll = createCostPoll(loki.url, {
        oldestSessionStart: async () => OCT_20 - DAY,
        store: async () => {},
        now: () => OCT_20 + 3600_000,
      });

      await poll();
      await poll();
      up = true;
      await poll();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(loki.stats.length).toBeGreaterThan(0);
      expect(loki.queries.at(-1)).toEqual({ time: OCT_20 + 3600_000, range: "3600s" });
      warn.mockRestore();
    });

    test("surfaces Loki's error message, such as the series limit", async () => {
      server = Bun.serve({ port: 0, fetch: () => new Response("maximum number of series (500) reached", { status: 400 }) });
      const warn = spyOn(console, "warn").mockImplementation(() => {});
      const poll = createCostPoll(`http://localhost:${server.port}`, {
        oldestSessionStart: async () => null,
        store: async () => {},
        now: () => OCT_20 + 3600_000,
      });

      await poll();

      expect(String(warn.mock.calls[0])).toContain("maximum number of series");
      warn.mockRestore();
    });
  });
});
