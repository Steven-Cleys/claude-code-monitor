import { ref, computed, onUnmounted } from "vue";
import type { TranscriptLine, ContentBlock, SubagentMetadata } from "../types/events";

export function useTranscript(agentId: string, status: "running" | "completed") {
  const messages = ref<TranscriptLine[]>([]);
  const metadata = ref<SubagentMetadata | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const isLive = ref(status === "running");

  // Filter state
  const showThinking = ref(true);
  const showTools = ref(true);
  const showProgress = ref(false);

  // Scroll state
  const isPinnedToBottom = ref(true);

  // WebSocket for live updates
  let ws: WebSocket | null = null;

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

      if (!msg.message?.content || !Array.isArray(msg.message.content)) {
        if (msg.type === "user") return true;
        if (msg.type === "assistant") return true;
        if (msg.type === "progress") return showProgress.value;
        return true;
      }

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
      const res = await fetch(`/api/transcripts/${agentId}`);
      if (!res.ok) {
        error.value = res.status === 404 ? "Transcript not found" : `Error: ${res.status}`;
        isLoading.value = false;
        return;
      }
      const data = await res.json();
      messages.value = data.messages;
      metadata.value = data.metadata;
      isLive.value = data.isLive;
    } catch (e) {
      error.value = `Failed to load transcript: ${e}`;
    } finally {
      isLoading.value = false;
    }
  }

  function subscribeLive() {
    if (!isLive.value) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/transcript`);

    ws.onopen = () => {
      ws?.send(JSON.stringify({ action: "subscribe", topic: `transcript:${agentId}` }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "transcript_line" && msg.agentId === agentId) {
          messages.value.push(msg.data);
        }
        if (msg.type === "transcript_complete" && msg.agentId === agentId) {
          isLive.value = false;
          ws?.close();
          ws = null;
          fetchTranscript();
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      // Don't reconnect — modal handles lifecycle
    };
  }

  function jumpToLatest() {
    isPinnedToBottom.value = true;
  }

  // Initialize
  fetchTranscript().then(() => {
    if (isLive.value) subscribeLive();
  });

  onUnmounted(() => {
    if (ws) {
      ws.send(JSON.stringify({ action: "unsubscribe", topic: `transcript:${agentId}` }));
      ws.close();
      ws = null;
    }
  });

  return {
    messages,
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
