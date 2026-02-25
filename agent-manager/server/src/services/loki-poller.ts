import { sql } from "../db/connection";

const LOKI_URL = process.env.LOKI_URL ?? "http://localhost:3100";

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiResponse {
  status: string;
  data: { result: LokiStream[] };
}

async function queryLoki(logql: string, sinceMs = 60_000): Promise<LokiStream[]> {
  const start = String((Date.now() - sinceMs) * 1_000_000);
  const end = String(Date.now() * 1_000_000);
  const params = new URLSearchParams({
    query: logql,
    start,
    end,
    limit: "100",
    direction: "backward",
  });

  const response = await fetch(`${LOKI_URL}/loki/api/v1/query_range?${params}`);
  if (!response.ok) return [];

  const body: LokiResponse = await response.json();
  return body.data?.result ?? [];
}

type BroadcastFn = (topic: string, data: unknown) => void;

export function startLokiPoller(broadcast: BroadcastFn, intervalMs = 15_000) {
  const timer = setInterval(async () => {
    try {
      const streams = await queryLoki('{service_name="claude-code"} | json');

      for (const stream of streams) {
        const sessionId = stream.stream.session_id;
        const model = stream.stream.model;

        if (sessionId && model) {
          const [updated] = await sql`
            UPDATE sessions SET model = ${model}
            WHERE id = ${sessionId} AND (model IS NULL OR model != ${model})
            RETURNING id
          `;
          if (updated) {
            broadcast("sessions", {
              type: "session_enriched",
              data: { id: sessionId, model },
            });
          }
        }
      }
    } catch (err) {
      console.error("Loki poll error:", err);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
