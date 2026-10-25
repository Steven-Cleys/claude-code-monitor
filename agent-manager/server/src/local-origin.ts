import { createMiddleware } from "hono/factory";

// The API and WebSockets have no authentication and serve full transcripts,
// so a browser may only reach them from a page served by this machine.
// WebSocket upgrades are not covered by CORS, hence a check on every request.
// Requests without an Origin (curl in send-hook.sh, same-origin GETs) pass.
export const localOriginOnly = createMiddleware(async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && !isLocalOrigin(origin)) {
    return c.json({ error: "Forbidden origin" }, 403);
  }
  await next();
});

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
