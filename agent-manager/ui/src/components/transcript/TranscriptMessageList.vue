<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from "vue";
import type { TranscriptLine } from "../../types/events";
import TranscriptMessage from "./TranscriptMessage.vue";

const props = defineProps<{
  messages: TranscriptLine[];
  toolResults: Map<string, { content: string; is_error: boolean }>;
  showThinking: boolean;
  showTools: boolean;
  isPinnedToBottom: boolean;
}>();

const emit = defineEmits<{
  "update:isPinnedToBottom": [value: boolean];
}>();

const scrollContainer = ref<HTMLElement | null>(null);

function scrollToBottom() {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
}

function onScroll() {
  if (!scrollContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const atBottom = scrollHeight - scrollTop - clientHeight < 50;
  emit("update:isPinnedToBottom", atBottom);
}

watch(
  () => props.messages.length,
  () => {
    if (props.isPinnedToBottom) {
      nextTick(scrollToBottom);
    }
  },
);

onMounted(() => {
  // Only auto-scroll live transcripts (where isPinnedToBottom starts true).
  // Completed transcripts open scrolled to the top so the user sees the
  // conversation from the start.
  if (props.isPinnedToBottom) nextTick(scrollToBottom);
});

defineExpose({ scrollToBottom });
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2"
    @scroll="onScroll"
  >
    <TranscriptMessage
      v-for="(msg, idx) in messages"
      :key="msg.uuid ?? msg.message?.id ?? `${msg.timestamp}-${idx}`"
      :msg="msg"
      :tool-results="toolResults"
      :show-thinking="showThinking"
      :show-tools="showTools"
    />
    <div v-if="messages.length === 0" class="flex items-center justify-center h-full text-ghost text-sm">
      No messages yet...
    </div>
  </div>
</template>
