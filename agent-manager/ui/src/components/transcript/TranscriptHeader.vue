<script setup lang="ts">
import type { SubagentMetadata } from "../../types/events";
import { formatTokenCount } from "../../utils/format";

defineProps<{
  name: string;
  agentType: string | null;
  status: "running" | "completed";
  metadata: SubagentMetadata | null;
  isLive: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="flex items-center justify-between px-4 py-3 border-b border-ink-border bg-ink-light">
    <div class="flex items-center gap-2.5">
      <span
        class="w-2 h-2 rounded-full shrink-0"
        :class="status === 'running' ? 'bg-signal-green animate-pulse-glow' : 'bg-ghost/60'"
      />
      <span class="text-sm font-semibold text-purple-300">{{ name }}</span>
      <span
        v-if="metadata?.model"
        class="text-[0.6rem] px-2 py-0.5 rounded-full bg-indigo-900/50 text-purple-300 border border-indigo-700/40"
      >
        {{ metadata.model }}
      </span>
      <span v-if="agentType" class="text-[0.6rem] text-ghost">{{ agentType }} agent</span>
      <span
        v-if="isLive"
        class="text-[0.55rem] uppercase tracking-wider text-signal-green font-semibold"
      >
        LIVE
      </span>
    </div>
    <div class="flex items-center gap-3">
      <div v-if="metadata" class="flex items-center gap-2 text-[0.65rem] text-ghost">
        <span>{{ formatTokenCount(metadata.total_input_tokens) }} in</span>
        <span class="text-ghost/40">/</span>
        <span>{{ formatTokenCount(metadata.total_output_tokens) }} out</span>
      </div>
      <button
        class="text-ghost hover:text-gray-300 transition-colors text-lg leading-none px-1"
        @click="emit('close')"
      >
        &times;
      </button>
    </div>
  </div>
</template>
