import { ref, computed, onUnmounted } from "vue";
import type { TranscriptLine, ContentBlock, SubagentMetadata } from "../types/events";
import { wsUrl } from "../utils/ws";

export function useTranscript(
  id: string,
  status: "running" | "completed",
  kind: "subagent" | "session" = "subagent",
) {
  const apiUrl = kind === "session" ? `/api/transcripts/session/${id}` : `/api/transcripts/${id}`;
  const messages = ref<TranscriptLine[]>([]);
  const metadata = ref<SubagentMetadata | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const isLive = ref(status === "running");

  // Filter state
  const showThinking = ref(true);
  const showTools = ref(true);
  const showProgress = ref(false);

  // Scroll state — live transcripts follow new messages; completed ones
  // open at the top so the user sees the full conversation from the start.
  const isPinnedToBottom = ref(status === "running");

  // WebSocket for live updates
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // Tool result lookup: maps tool_use_id → tool_result content
  const toolResults = computed(() => {
    const map = new Map<string, { content: string; is_error: boolean }>();
    for (const msg of messages.value) {
      if (!msg.message?.content || !Array.isArray(msg.message.content)) continue;
      for (const block of msg.message.content as ContentBlock[]) {
        if (block.type === "tool_result" && block.tool_use_id) {
          map.set(block.tool_use_id, {
            content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
            is_error: block.is_error ?? false,
          });
        }
      }
    }
    return map;
  });

  const filteredMessages = computed(() => {
    return messages.value.filter((msg) => {
      if (msg.type === "progress" && !showProgress.value) return false;

      if (!msg.message?.content || !Array.isArray(msg.message.content)) return true;

      const blocks = msg.message.content as ContentBlock[];
      const hasVisibleBlock = blocks.some((b) => {
        if (b.type === "thinking" && !showThinking.value) return false;
        if (b.type === "tool_use" && !showTools.value) return false;
        if (b.type === "tool_result" && !showTools.value) return false;
        return true;
      });

      return hasVisibleBlock;
    });
  });

  const messageCount = computed(() => filteredMessages.value.length);

  async function fetchTranscript() {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        error.value = res.status === 404 ? "Transcript not found" : `Error: ${res.status}`;
        isLoading.value = false;
        return;
      }
      const data = await res.json();
      error.value = null;
      messages.value = data.messages;
      metadata.value = data.metadata;
      isLive.value = data.isLive;
    } catch (e) {
      error.value = `Failed to load transcript: ${e}`;
    } finally {
      isLoading.value = false;
    }
  }

  async function load() {
    await fetchTranscript();
    if (isLive.value && !disposed) subscribeLive();
  }

  function closeSocket() {
    const socket = ws;
    ws = null;
    socket?.close();
  }

  function subscribeLive() {
    const socket = new WebSocket(wsUrl("/ws/transcript"));
    ws = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ action: "subscribe", topic: `transcript:${id}` }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "transcript_line" && msg.agentId === id) {
          messages.value.push(msg.data);
        }
        // The server also ends a watch after its 1h safety limit, so the
        // refetch decides whether to subscribe again.
        if (msg.type === "transcript_complete" && msg.agentId === id) {
          isLive.value = false;
          closeSocket();
          load();
        }
      } catch {
        // Ignore parse errors
      }
    };

    // Lines broadcast while the socket was down are gone, so refetch first.
    socket.onclose = () => {
      if (ws !== socket || disposed) return;
      ws = null;
      reconnectTimer = setTimeout(load, 3000);
    };
  }

  function jumpToLatest() {
    isPinnedToBottom.value = true;
  }

  load();

  onUnmounted(() => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    closeSocket();
  });

  return {
    filteredMessages,
    metadata,
    isLoading,
    error,
    isLive,
    showThinking,
    showTools,
    showProgress,
    isPinnedToBottom,
    messageCount,
    toolResults,
    jumpToLatest,
  };
}
