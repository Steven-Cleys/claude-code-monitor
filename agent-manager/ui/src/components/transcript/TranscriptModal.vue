<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { InspectTarget } from "../../types/events";
import { useTranscript } from "../../composables/useTranscript";
import { shortId } from "../../utils/format";
import TranscriptHeader from "./TranscriptHeader.vue";
import TranscriptMessageList from "./TranscriptMessageList.vue";

const props = defineProps<{
  target: InspectTarget;
}>();

const emit = defineEmits<{
  close: [];
}>();

const resolved = computed(() => {
  if (props.target.kind === "subagent") {
    const sa = props.target.subagent;
    return {
      id: sa.agent_id ?? "",
      kind: "subagent" as const,
      name: sa.name,
      agentType: sa.subagent_type,
      status: sa.status,
    };
  }
  const s = props.target.session;
  const status: "running" | "completed" = s.status === "ended" ? "completed" : "running";
  return {
    id: s.id,
    kind: "session" as const,
    name: shortId(s.id),
    agentType: "main",
    status,
  };
});

// Guard against a null agent_id slipping through from a stale `inspectedSubagent`
// ref. The parent already guards handleInspectAgent, but this is belt and
// suspenders — if somehow the modal mounts without an id, close it and
// short-circuit into an empty-state.
const {
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
} = useTranscript(resolved.value.id, resolved.value.status, resolved.value.kind);

onMounted(() => {
  if (!resolved.value.id) emit("close");
});

const messageListRef = ref<InstanceType<typeof TranscriptMessageList> | null>(null);

function handleJumpToLatest() {
  jumpToLatest();
  messageListRef.value?.scrollToBottom();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

function onBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).dataset.backdrop) emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-backdrop="true"
      @click="onBackdropClick"
    >
      <div class="flex flex-col w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-w-7xl bg-ink rounded-lg border border-ink-border shadow-2xl overflow-hidden">
        <TranscriptHeader
          :name="resolved.name"
          :agent-type="resolved.agentType"
          :status="resolved.status"
          :metadata="metadata"
          :is-live="isLive"
          @close="emit('close')"
        />

        <div class="flex items-center gap-2 px-4 py-2 border-b border-ink-border bg-ink/80">
          <button
            class="text-[0.6rem] px-2.5 py-0.5 rounded border transition-colors"
            :class="showThinking
              ? 'bg-amber-900/20 border-amber-700/30 text-amber-300'
              : 'bg-ink-mid border-ink-border text-ghost'"
            @click="showThinking = !showThinking"
          >
            Thinking: {{ showThinking ? "ON" : "OFF" }}
          </button>
          <button
            class="text-[0.6rem] px-2.5 py-0.5 rounded border transition-colors"
            :class="showTools
              ? 'bg-amber-900/20 border-amber-700/30 text-amber-300'
              : 'bg-ink-mid border-ink-border text-ghost'"
            @click="showTools = !showTools"
          >
            Tools: {{ showTools ? "ON" : "OFF" }}
          </button>
          <button
            class="text-[0.6rem] px-2.5 py-0.5 rounded border transition-colors"
            :class="showProgress
              ? 'bg-ink-surface border-ink-border text-ghost-light'
              : 'bg-ink-mid border-ink-border text-ghost'"
            @click="showProgress = !showProgress"
          >
            Progress: {{ showProgress ? "ON" : "OFF" }}
          </button>
          <div class="flex-1" />
          <span class="text-[0.6rem] text-ghost">{{ messageCount }} messages</span>
        </div>

        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
          <span class="text-ghost text-sm animate-pulse">Loading transcript...</span>
        </div>

        <div v-else-if="error" class="flex-1 flex items-center justify-center">
          <span class="text-red-400 text-sm">{{ error }}</span>
        </div>

        <TranscriptMessageList
          v-else
          ref="messageListRef"
          :messages="filteredMessages"
          :tool-results="toolResults"
          :show-thinking="showThinking"
          :show-tools="showTools"
          :is-pinned-to-bottom="isPinnedToBottom"
          @update:is-pinned-to-bottom="isPinnedToBottom = $event"
        />

        <div
          v-if="!isPinnedToBottom && !isLoading && !error"
          class="border-t border-ink-border bg-ink-light py-2 text-center"
        >
          <button
            class="text-blue-400 text-[0.7rem] hover:underline"
            @click="handleJumpToLatest"
          >
            &darr; Jump to latest
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
