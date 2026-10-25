import type { ServerWebSocket } from "bun";
import type { UpgradeWebSocket } from "hono/ws";
import { startWatching } from "../services/transcript-watcher";
import type { BroadcastFn } from "../types/broadcast";

export function createTranscriptWebSocketRoute(
  upgradeWebSocket: UpgradeWebSocket<ServerWebSocket>,
  broadcast: BroadcastFn,
) {
  return upgradeWebSocket(() => ({
    onOpen(_event, _ws) {
      console.log("Transcript WebSocket client connected");
    },
    onMessage(event, ws) {
      try {
        const raw =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
        const msg = JSON.parse(raw);
        if (typeof msg.topic !== "string" || !msg.topic.startsWith("transcript:")) return;

        if (msg.action === "subscribe") {
          ws.raw?.subscribe(msg.topic);
          const agentId = msg.topic.replace("transcript:", "");
          startWatching(agentId, broadcast);
        }

        if (msg.action === "unsubscribe") {
          ws.raw?.unsubscribe(msg.topic);
        }
      } catch {
        // Ignore malformed messages
      }
    },
    onClose(_event, _ws) {
      console.log("Transcript WebSocket client disconnected");
    },
  }));
}
