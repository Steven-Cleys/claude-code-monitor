import { Hono } from "hono";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { localOriginOnly } from "./local-origin";
import { runMigrations } from "./db/migrate";
import { createHooksRouter } from "./routes/hooks";
import { createWebSocketRoute } from "./ws/handler";
import { startSessionTracker } from "./services/session-tracker";
import { startContextPoller } from "./services/context-poller";
import { startTranscriptScanner } from "./services/transcript-scanner";
import { startCostPoller } from "./services/cost-poller";
import { reextractSubagentMetadata } from "./services/subagent-metadata";
import { createSessionsRouter } from "./routes/sessions";
import { eventsRouter } from "./routes/events";
import { createTranscriptsRouter } from "./routes/transcripts";
import { createTranscriptWebSocketRoute } from "./ws/transcript-handler";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

app.use(logger());
app.use(localOriginOnly);

app.get("/api/health", (c) => c.json({ status: "ok" }));

let server: ReturnType<typeof Bun.serve> | undefined;

function broadcast(topic: string, data: unknown) {
  // Pre-startup broadcasts (from pollers or import-time code) are silently
  // dropped — `server` is assigned in Bun.serve() below, and any broadcast
  // fired before that would otherwise crash with "publish of undefined".
  if (!server) return;
  server.publish(topic, JSON.stringify(data));
}

app.route("/api/hooks", createHooksRouter(broadcast));
app.route("/api/sessions", createSessionsRouter(broadcast));
app.route("/api/events", eventsRouter);
app.route("/api/transcripts", createTranscriptsRouter(broadcast));

app.get("/ws", createWebSocketRoute(upgradeWebSocket));
app.get("/ws/transcript", createTranscriptWebSocketRoute(upgradeWebSocket, broadcast));

await runMigrations();

startSessionTracker(broadcast);
startContextPoller(broadcast);
startTranscriptScanner(broadcast);
startCostPoller(broadcast);
reextractSubagentMetadata(broadcast).catch((err) =>
  console.error("Failed to re-extract subagent metadata:", err),
);

server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
  websocket,
});

console.log(`Agent Manager server running on http://localhost:${server.port}`);
