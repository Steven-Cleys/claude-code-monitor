import type { UpgradeWebSocket } from "hono/bun";

export function createWebSocketRoute(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      ws.raw?.subscribe("events");
      ws.raw?.subscribe("sessions");
      console.log("WebSocket client connected");
    },
    onClose(_event, ws) {
      ws.raw?.unsubscribe("events");
      ws.raw?.unsubscribe("sessions");
      console.log("WebSocket client disconnected");
    },
    onMessage(_event, ws) {
      // Reserved for future filtering
    },
  }));
}
