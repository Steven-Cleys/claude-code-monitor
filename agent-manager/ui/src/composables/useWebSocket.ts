import { ref, onUnmounted } from "vue";
import type { WsMessage } from "../types/events";
import { wsUrl } from "../utils/ws";

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const connected = ref(false);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    ws = new WebSocket(wsUrl("/ws"));

    ws.onopen = () => {
      connected.value = true;
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      onMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
      connected.value = false;
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  }

  connect();
  onUnmounted(disconnect);

  return { connected, disconnect };
}
