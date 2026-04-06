import { ref, onUnmounted } from "vue";
import type { WsMessage } from "../types/events";

const MAX_MESSAGES = 500;

export function useWebSocket() {
  const connected = ref(false);
  const messages = ref<WsMessage[]>([]);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      connected.value = true;
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      if (messages.value.length >= MAX_MESSAGES) {
        messages.value.splice(0, messages.value.length - MAX_MESSAGES + 1);
      }
      messages.value.push(msg);
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

  return { connected, messages, disconnect };
}
