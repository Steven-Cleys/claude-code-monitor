import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { createBunWebSocket } from "hono/bun";
import { runMigrations } from "./db/migrate";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use(logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

await runMigrations();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
  websocket,
});

console.log(`Agent Manager server running on http://localhost:${server.port}`);

export { app, server, upgradeWebSocket };
