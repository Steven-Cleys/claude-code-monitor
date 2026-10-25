import type { ServerWebSocket } from "bun";
import type { UpgradeWebSocket } from "hono/ws";

export function createWebSocketRoute(upgradeWebSocket: UpgradeWebSocket<ServerWebSocket>) {
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
  }));
}
