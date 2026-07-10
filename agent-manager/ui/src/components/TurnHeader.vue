<script setup lang="ts">
import { computed } from "vue";
import type { Turn } from "../types/events";
import { formatTime, formatTokenCount, formatCost, formatDuration } from "../utils/format";
import { calculateCost } from "../utils/pricing";

const props = defineProps<{
  turn: Turn;
  model: string | null;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();

const cost = computed(() => calculateCost(props.turn.tokens, props.model));
const hasTokens = computed(() =>
  Object.values(props.turn.tokens).some((v) => v > 0),
);
</script>

<template>
  <div
    class="flex items-center gap-3 py-2 px-3 mx-1 mt-2 mb-0.5 rounded text-xs cursor-pointer transition-all duration-150 border border-ink-border bg-ink-surface/60 hover:bg-ink-surface hover:border-amber-muted/50"
    @click="emit('toggle')"
  >
    <span
      class="shrink-0 w-4 text-center transition-transform duration-200 text-amber-glow"
      :class="{ 'rotate-90': !collapsed }"
    >
      &#9656;
    </span>

    <span class="text-ghost shrink-0 w-16 tabular-nums">{{ formatTime(turn.start) }}</span>

    <span class="shrink-0 text-amber-glow font-semibold">#{{ turn.index + 1 }}</span>

    <span class="text-gray-100 truncate flex-1" :title="turn.prompt">{{ turn.prompt }}</span>

    <span class="shrink-0 flex items-center gap-2 text-ghost">
      <span class="tabular-nums">{{ formatDuration(turn.duration_ms) }}</span>
      <span v-if="turn.tool_calls > 0" class="chip bg-ink-mid text-cyan-glow" title="Tool calls">
        {{ turn.tool_calls }} tools
      </span>
      <span v-if="turn.files_touched.length > 0" class="chip bg-ink-mid text-ghost-light" :title="turn.files_touched.join('\n')">
        {{ turn.files_touched.length }} files
      </span>
      <span v-if="turn.failures > 0" class="chip bg-ink-mid text-signal-red" title="Tool failures">
        {{ turn.failures }} failed
      </span>
      <span v-if="hasTokens" class="chip bg-ink-mid text-ghost-light" title="Output tokens">
        {{ formatTokenCount(turn.tokens.output) }} out
      </span>
      <span v-if="hasTokens" class="text-amber-glow font-semibold tabular-nums" title="Estimated turn cost (list price)">
        {{ formatCost(cost) }}
      </span>
    </span>
  </div>
</template>
