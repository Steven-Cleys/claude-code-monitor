import { COST_LATE_EVENT_MARGIN_MS, COST_POLL_INTERVAL_MS } from "../constants";
import { sql } from "../db/connection";
import type { BroadcastFn } from "../types/broadcast";

const DAY_MS = 86_400_000;
const QUERY_TIMEOUT_MS = 10_000;
const STREAM = '{service_name="claude-code"}';
// Loki's max_query_length is 30d1h, index stats included.
const STATS_WINDOW_MS = 30 * DAY_MS;

// Cost comes from the claude_code.api_request log events: one event per API
// call carrying its exact cost, so there is no running total that can reset.
// Sums are kept per session and UTC day: one day of sessions stays under
// Loki's max_query_series (500) and max_query_length, closed days never need
// re-reading, and a session's full total is the sum of its days however long
// it runs. Known limit: more than 500 sessions with cost on one UTC day fails
// that day's query with Loki's series-limit error.
function dayCostQuery(rangeSeconds: number) {
  return `sum by (session_id) (sum_over_time(${STREAM} | event_name="api_request" | unwrap cost_usd | __error__="" [${rangeSeconds}s]))`;
}

export type DayCost = {
  session_id: string;
  day: string;
  cost: number;
};

interface LokiResponse {
  status: string;
  error?: string;
  data?: { result: { metric: { session_id?: string }; value: [number, string] }[] };
}

export function parseCostVector(body: unknown): Map<string, number> {
  const response = body as LokiResponse;
  if (response.status !== "success") throw new Error(response.error ?? "Loki query failed");

  const costs = new Map<string, number>();
  for (const { metric, value } of response.data?.result ?? []) {
    const cost = Number(value[1]);
    if (metric.session_id && Number.isFinite(cost)) costs.set(metric.session_id, cost);
  }
  return costs;
}

function startOfDay(ms: number) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function liveDays(now: number): number[] {
  const today = startOfDay(now);
  return now - today < COST_LATE_EVENT_MARGIN_MS ? [today - DAY_MS, today] : [today];
}

export function backfillDays(from: number, now: number): number[] {
  const days: number[] = [];
  for (let day = startOfDay(from); day < startOfDay(now); day += DAY_MS) days.push(day);
  return days;
}

async function lokiGet(lokiUrl: string, path: string, params: Record<string, string>) {
  const url = `${lokiUrl}/loki/api/v1/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// Loki has no "oldest entry" API, so walk back through windows its index
// answers cheaply. Starting at the oldest session is not enough: a session
// begun before the hooks were installed has cost from before its first hook
// event. The walk only stops at an empty window older than every session, so
// a month without Claude Code does not cut it short.
export async function oldestDataDay(lokiUrl: string, oldestSessionStart: number, now: number): Promise<number> {
  let end = now;
  for (;;) {
    const start = end - STATS_WINDOW_MS;
    const { entries } = (await lokiGet(lokiUrl, "index/stats", {
      query: STREAM,
      start: String(start / 1000),
      end: String(end / 1000),
    })) as { entries: number };
    if (entries === 0 && start <= oldestSessionStart) return startOfDay(end);
    end = start;
  }
}

// Loki evaluates [range] as (time - range, time], so whole seconds from the
// day's start keep neighbouring days from overlapping.
async function queryDay(lokiUrl: string, day: number, now: number): Promise<DayCost[]> {
  const rangeSeconds = Math.max(1, Math.floor((Math.min(day + DAY_MS, now) - day) / 1000));
  const body = await lokiGet(lokiUrl, "query", {
    query: dayCostQuery(rangeSeconds),
    time: String((day + rangeSeconds * 1000) / 1000),
  });
  const dayKey = new Date(day).toISOString().slice(0, 10);
  return [...parseCostVector(body)].map(([session_id, cost]) => ({ session_id, day: dayKey, cost }));
}

async function queryDays(lokiUrl: string, days: number[], now: number) {
  const rows: DayCost[] = [];
  for (const day of days) rows.push(...(await queryDay(lokiUrl, day, now)));
  return rows;
}

async function storeCosts(rows: DayCost[], broadcast: BroadcastFn) {
  if (rows.length === 0) return;
  const updated = await sql.begin(async (transaction) => {
    // postgres.js' types lose TransactionSql's call signature under TS 5.
    const tx = transaction as unknown as typeof sql;
    await tx`
      INSERT INTO session_cost_days (session_id, day, cost_usd)
      SELECT session_id, day, cost FROM jsonb_to_recordset(${tx.json(rows)}) AS r(session_id text, day date, cost numeric)
      ON CONFLICT (session_id, day) DO UPDATE SET cost_usd = EXCLUDED.cost_usd
    `;
    return tx`
      UPDATE sessions s SET cost_usd = t.total
      FROM (
        SELECT session_id, SUM(cost_usd) AS total FROM session_cost_days
        WHERE session_id IN (SELECT session_id FROM jsonb_to_recordset(${tx.json(rows)}) AS r(session_id text))
        GROUP BY session_id
      ) t
      WHERE s.id = t.session_id AND s.cost_usd IS DISTINCT FROM t.total
      RETURNING s.id, s.cost_usd
    `;
  });
  for (const row of updated) {
    broadcast("sessions", {
      type: "session_cost",
      data: { id: row.id, cost_usd: Number(row.cost_usd) },
    });
  }
}

interface CostPollDeps {
  oldestSessionStart: () => Promise<number | null>;
  store: (rows: DayCost[]) => Promise<void>;
  now?: () => number;
}

export function createCostPoll(lokiUrl: string, { oldestSessionStart, store, now = Date.now }: CostPollDeps) {
  let backfilled = false;
  let warned = false;
  let running = false;

  return async function poll() {
    // The backfill reads one query per day and can outlast the interval.
    if (running) return;
    running = true;
    try {
      const at = now();
      if (!backfilled) {
        const oldest = await oldestSessionStart();
        if (oldest !== null) {
          const from = await oldestDataDay(lokiUrl, oldest, at);
          await store(await queryDays(lokiUrl, backfillDays(from, at), at));
        }
        backfilled = true;
      }
      // Today is re-read whole each time, so events that reach Loki late
      // still count. Yesterday gets the same right after midnight.
      await store(await queryDays(lokiUrl, liveDays(at), at));
      warned = false;
    } catch (err) {
      if (!warned) {
        console.warn(`Cost poll via ${lokiUrl} failed, cards show token estimates until it recovers:`, err);
        warned = true;
      }
    } finally {
      running = false;
    }
  };
}

export function startCostPoller(
  broadcast: BroadcastFn,
  lokiUrl = process.env.LOKI_URL,
  intervalMs = COST_POLL_INTERVAL_MS,
) {
  if (!lokiUrl) {
    console.log("LOKI_URL not set, cards show token estimates instead of reported cost");
    return () => {};
  }

  const poll = createCostPoll(lokiUrl, {
    oldestSessionStart: async () => {
      const [row] = await sql`SELECT MIN(first_seen) AS oldest FROM sessions`;
      return row?.oldest ? new Date(row.oldest).getTime() : null;
    },
    store: (rows) => storeCosts(rows, broadcast),
  });
  poll();
  const timer = setInterval(poll, intervalMs);
  return () => clearInterval(timer);
}
