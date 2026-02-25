import { PROMETHEUS_POLL_INTERVAL_MS, PROMETHEUS_TOKEN_QUERY } from "../constants";

const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? "http://localhost:9090";

interface PromResult {
  metric: Record<string, string>;
  value: [number, string];
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

type BroadcastFn = (topic: string, data: unknown) => void;

export function startPrometheusPoller(broadcast: BroadcastFn, intervalMs = PROMETHEUS_POLL_INTERVAL_MS) {
  const timer = setInterval(async () => {
    try {
      const tokenResults = await queryPrometheus(PROMETHEUS_TOKEN_QUERY);

      const sessionTokens: Record<string, Record<string, number>> = {};
      for (const result of tokenResults) {
        const sid = result.metric.session_id;
        const tokenType = result.metric.token_type;
        if (!sid) continue;
        sessionTokens[sid] ??= {};
        sessionTokens[sid][tokenType] = parseFloat(result.value[1]);
      }

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
