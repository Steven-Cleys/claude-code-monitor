import { createMiddleware } from "hono/factory";

// The API and WebSockets have no authentication and serve full transcripts,
// so a browser may only reach them from a page served by this machine.
// WebSocket upgrades are not covered by CORS, hence a check on every request.
// Requests without an Origin (curl in send-hook.sh, same-origin GETs) pass.
// The Host check stops DNS rebinding: a foreign domain resolved to 127.0.0.1
// is same-origin to the browser, so its GETs carry no Origin at all.
export const localOriginOnly = createMiddleware(async (c, next) => {
  const origin = c.req.header("Origin");
  const host = c.req.header("Host");
  if ((origin && !isLocal(origin)) || (host && !isLocal(`http://${host}`))) {
    return c.json({ error: "Forbidden origin or host" }, 403);
  }
  await next();
});

function isLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
