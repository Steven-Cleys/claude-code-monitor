import { test, expect, describe } from "bun:test";
import { Hono } from "hono";
import { localOriginOnly } from "../local-origin";

const app = new Hono();
app.use(localOriginOnly);
app.get("/api/health", (c) => c.json({ status: "ok" }));

const get = (origin?: string) =>
  app.request("/api/health", { headers: origin ? { Origin: origin } : {} });

describe("localOriginOnly", () => {
  test("rejects a request from a foreign web page without a CORS grant", async () => {
    const res = await get("https://evil.example");

    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("rejects the opaque null origin of sandboxed pages and files", async () => {
    expect((await get("null")).status).toBe(403);
  });

  test("rejects a foreign host that only starts with localhost", async () => {
    expect((await get("http://localhost.evil.example")).status).toBe(403);
  });

  test("serves the UI on any local port", async () => {
    expect((await get("http://localhost:3002")).status).toBe(200);
    expect((await get("http://127.0.0.1:13002")).status).toBe(200);
  });

  test("serves requests without an Origin, like the curl in send-hook.sh", async () => {
    expect((await get()).status).toBe(200);
  });
});
