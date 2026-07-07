import { PROMETHEUS_POLL_INTERVAL_MS, PROMETHEUS_TOKEN_QUERY } from "../constants";
import type { BroadcastFn } from "../types/broadcast";

const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? "http://localhost:9090";

interface PromResult {
  metric: Record<string, string>;
  value: [number, string];
}

// The OTEL metric labels token types in camelCase; the UI prices them by the
// snake_case keys it has always used, so normalize here.
const TOKEN_TYPE_KEYS: Record<string, string> = {
  input: "input",
  output: "output",
  cacheRead: "cache_read",
  cacheCreation: "cache_creation",
};

export function groupTokensBySession(results: PromResult[]): Record<string, Record<string, number>> {
  const sessionTokens: Record<string, Record<string, number>> = {};
  for (const result of results) {
    const sid = result.metric.session_id;
    const tokenType = TOKEN_TYPE_KEYS[result.metric.type];
    if (!sid || !tokenType) continue;
    sessionTokens[sid] ??= {};
    sessionTokens[sid][tokenType] = parseFloat(result.value[1]);
  }
  return sessionTokens;
}

interface PromResponse {
  status: string;
  data: { result: PromResult[] };
}

async function queryPrometheus(promql: string): Promise<PromResult[]> {
  const params = new URLSearchParams({ query: promql });
  const response = await fetch(`${PROMETHEUS_URL}/api/v1/query?${params}`);
  if (!response.ok) return [];

  const body: PromResponse = await response.json();
  return body.data?.result ?? [];
}

export function startPrometheusPoller(broadcast: BroadcastFn, intervalMs = PROMETHEUS_POLL_INTERVAL_MS) {
  const timer = setInterval(async () => {
    try {
      const tokenResults = await queryPrometheus(PROMETHEUS_TOKEN_QUERY);
      const sessionTokens = groupTokensBySession(tokenResults);

      for (const [sessionId, tokens] of Object.entries(sessionTokens)) {
        broadcast("sessions", {
          type: "session_metrics",
          data: { id: sessionId, tokens },
        });
      }
    } catch (err) {
      console.error("Prometheus poll error:", err);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
