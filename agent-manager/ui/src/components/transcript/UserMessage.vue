<script setup lang="ts">
defineProps<{
  content: string;
  timestamp: string;
}>();

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
</script>

<template>
  <div class="border-l-[3px] border-blue-500 bg-blue-950/30 rounded-r-md px-3 py-2">
    <div class="flex items-center justify-between mb-1">
      <span class="text-[0.6rem] font-semibold tracking-wider text-blue-400">USER</span>
      <span class="text-[0.55rem] text-ghost">{{ formatTime(timestamp) }}</span>
    </div>
    <div class="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{{ content }}</div>
  </div>
</template>
