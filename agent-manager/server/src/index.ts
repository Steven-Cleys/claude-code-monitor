import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { createBunWebSocket } from "hono/bun";
import { runMigrations } from "./db/migrate";
import { createHooksRouter } from "./routes/hooks";
import { createWebSocketRoute } from "./ws/handler";
import { startSessionTracker } from "./services/session-tracker";
import { startLokiPoller } from "./services/loki-poller";
import { startPrometheusPoller } from "./services/prometheus-poller";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use(logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

let server: ReturnType<typeof Bun.serve>;

function broadcast(topic: string, data: unknown) {
  server.publish(topic, JSON.stringify(data));
}

const hooksRouter = createHooksRouter(broadcast);
app.route("/api/hooks", hooksRouter);

app.get("/ws", createWebSocketRoute(upgradeWebSocket));

await runMigrations();

startSessionTracker(broadcast);
startLokiPoller(broadcast);
startPrometheusPoller(broadcast);

server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
  websocket,
});

console.log(`Agent Manager server running on http://localhost:${server.port}`);

export { app, server, upgradeWebSocket };
