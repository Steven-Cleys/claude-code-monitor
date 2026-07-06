<script setup lang="ts">
import { computed } from "vue";
import type { TranscriptLine, ContentBlock } from "../../types/events";
import ChatMessage from "./ChatMessage.vue";
import ToolCallBlock from "./ToolCallBlock.vue";
import ThinkingBlock from "./ThinkingBlock.vue";
import ProgressEvent from "./ProgressEvent.vue";

const props = defineProps<{
  msg: TranscriptLine;
  toolResults: Map<string, { content: string; is_error: boolean }>;
  showThinking: boolean;
  showTools: boolean;
}>();

const contentBlocks = computed((): ContentBlock[] => {
  if (!props.msg.message?.content) return [];
  if (typeof props.msg.message.content === "string") return [];
  return props.msg.message.content as ContentBlock[];
});

const textContent = computed((): string => {
  if (!props.msg.message?.content) return "";
  if (typeof props.msg.message.content === "string") return props.msg.message.content;
  return (props.msg.message.content as ContentBlock[])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
});

const isUserPrompt = computed(() => {
  if (props.msg.type !== "user") return false;
  if (!Array.isArray(props.msg.message?.content)) return true;
  const blocks = props.msg.message!.content as ContentBlock[];
  return blocks.some((b) => b.type !== "tool_result");
});

const isToolResultOnly = computed(() => {
  if (props.msg.type !== "user") return false;
  if (!Array.isArray(props.msg.message?.content)) return false;
  const blocks = props.msg.message!.content as ContentBlock[];
  return blocks.every((b) => b.type === "tool_result");
});

const progressText = computed(() => {
  if (typeof props.msg.message?.content === "string") return props.msg.message.content;
  return "";
});
</script>

<template>
  <!-- User prompt -->
  <ChatMessage
    v-if="isUserPrompt"
    role="user"
    :content="textContent"
    :timestamp="msg.timestamp"
  />

  <!-- Tool result-only user messages are hidden (rendered as part of ToolCallBlock) -->
  <template v-else-if="isToolResultOnly" />

  <!-- Assistant message -->
  <template v-else-if="msg.type === 'assistant'">
    <ChatMessage
      v-if="textContent.trim()"
      role="assistant"
      :content="textContent"
      :timestamp="msg.timestamp"
    />

    <template v-for="(block, idx) in contentBlocks" :key="idx">
      <ToolCallBlock
        v-if="block.type === 'tool_use' && showTools"
        :block="block"
        :result="block.id ? toolResults.get(block.id) : null"
      />
      <ThinkingBlock
        v-if="block.type === 'thinking' && showThinking"
        :content="block.thinking ?? ''"
      />
    </template>
  </template>

  <!-- Progress event -->
  <ProgressEvent
    v-else-if="msg.type === 'progress'"
    :content="progressText"
  />
</template>
