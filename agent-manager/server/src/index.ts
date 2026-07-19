import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { createBunWebSocket } from "hono/bun";
import { runMigrations } from "./db/migrate";
import { createHooksRouter } from "./routes/hooks";
import { createWebSocketRoute } from "./ws/handler";
import { startSessionTracker } from "./services/session-tracker";
import { startContextPoller } from "./services/context-poller";
import { startTranscriptScanner } from "./services/transcript-scanner";
import { createSessionsRouter } from "./routes/sessions";
import { eventsRouter } from "./routes/events";
import { createTranscriptsRouter } from "./routes/transcripts";
import { createTranscriptWebSocketRoute } from "./ws/transcript-handler";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use(logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

let server: ReturnType<typeof Bun.serve> | undefined;

function broadcast(topic: string, data: unknown) {
  // Pre-startup broadcasts (from pollers or import-time code) are silently
  // dropped — `server` is assigned in Bun.serve() below, and any broadcast
  // fired before that would otherwise crash with "publish of undefined".
  if (!server) return;
  server.publish(topic, JSON.stringify(data));
}

const hooksRouter = createHooksRouter(broadcast);
app.route("/api/hooks", hooksRouter);

app.get("/ws", createWebSocketRoute(upgradeWebSocket));

const sessionsRouter = createSessionsRouter(broadcast);
app.route("/api/sessions", sessionsRouter);
app.route("/api/events", eventsRouter);

const transcriptsRouter = createTranscriptsRouter(broadcast);
app.route("/api/transcripts", transcriptsRouter);

app.get("/ws/transcript", createTranscriptWebSocketRoute(upgradeWebSocket, broadcast));

await runMigrations();

startSessionTracker(broadcast);
startContextPoller(broadcast);
startTranscriptScanner(broadcast);

server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
  websocket,
});

console.log(`Agent Manager server running on http://localhost:${server.port}`);
