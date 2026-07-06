<script setup lang="ts">
import { formatTime } from "../../utils/format";

defineProps<{
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}>();
</script>

<template>
  <div
    class="border-l-[3px] rounded-r-md px-3 py-2"
    :class="role === 'user' ? 'border-blue-500 bg-blue-950/30' : 'border-purple-500 bg-purple-950/20'"
  >
    <div class="flex items-center justify-between mb-1">
      <span
        class="text-[0.6rem] font-semibold tracking-wider"
        :class="role === 'user' ? 'text-blue-400' : 'text-purple-400'"
      >
        {{ role.toUpperCase() }}
      </span>
      <span class="text-[0.55rem] text-ghost">{{ formatTime(timestamp) }}</span>
    </div>
    <div class="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{{ content }}</div>
  </div>
</template>
