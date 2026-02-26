<script setup lang="ts">
import type { Session } from "../types/events";
import { shortId, timeSince, formatTokenCount, formatCost } from "../utils/format";
import { calculateCost } from "../utils/pricing";

defineProps<{
  session: Session;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

function statusClass(status: string): string {
  switch (status) {
    case "active": return "status-active";
    case "idle": return "status-idle";
    default: return "status-ended";
  }
}

function statusLabel(status: string): string {
  return status.toUpperCase();
}

function modelShort(model: string | null): string {
  if (!model) return "unknown";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.split("/").pop()?.slice(0, 16) ?? model;
}

function cwdShort(cwd: string | null): string {
  if (!cwd) return "";
  const parts = cwd.split("/");
  return parts.slice(-2).join("/");
}
</script>

<template>
  <div
    class="rounded border p-3 cursor-pointer transition-all duration-200 group"
    :class="
      selected
        ? 'border-amber-glow/40 bg-amber-glow/5 glow-amber'
        : 'border-ink-border bg-ink-mid/50 hover:border-ink-border-light hover:bg-ink-mid'
    "
    @click="emit('select', session.id)"
  >
    <!-- Header row: status + ID + time -->
    <div class="flex items-center gap-2 mb-2">
      <span class="w-2 h-2 rounded-full shrink-0" :class="statusClass(session.status)" />
      <span class="text-xs font-semibold tracking-wider" :class="selected ? 'text-amber-glow' : 'text-gray-200'">
        {{ shortId(session.id) }}
      </span>
      <span class="text-[0.6rem] uppercase tracking-wider ml-auto" :class="{
        'text-signal-green': session.status === 'active',
        'text-signal-yellow': session.status === 'idle',
        'text-ghost': session.status === 'ended',
      }">
        {{ statusLabel(session.status) }}
      </span>
    </div>

    <!-- Model + time row -->
    <div class="flex items-center justify-between mb-1.5">
      <span class="chip bg-ink-surface/80 text-cyan-glow border border-ink-border">
        {{ modelShort(session.model) }}
      </span>
      <span class="text-[0.6rem] text-ghost">{{ timeSince(session.last_seen) }}</span>
    </div>

    <!-- Working directory -->
    <div v-if="session.cwd" class="text-[0.6rem] text-ghost truncate mb-1.5 pl-0.5">
      {{ cwdShort(session.cwd) }}
    </div>

    <!-- Last tool -->
    <div v-if="session.last_tool" class="text-[0.6rem] text-ghost-light mb-1.5 pl-0.5">
      <span class="text-ghost">last:</span> {{ session.last_tool }}
    </div>

    <!-- Token metrics bar -->
    <div
      v-if="session.tokens && (session.tokens.input || session.tokens.output || session.tokens.cache_read)"
      class="mt-2 pt-2 border-t border-ink-border/60"
    >
      <div class="flex items-center gap-1.5 flex-wrap">
        <span v-if="session.tokens.input" class="chip bg-signal-green/10 text-signal-green border border-signal-green/20">
          IN {{ formatTokenCount(session.tokens.input) }}
        </span>
        <span v-if="session.tokens.output" class="chip bg-amber-glow/10 text-amber-glow border border-amber-glow/20">
          OUT {{ formatTokenCount(session.tokens.output) }}
        </span>
        <span v-if="session.tokens.cache_read" class="chip bg-cyan-glow/10 text-cyan-glow border border-cyan-glow/20">
          CR {{ formatTokenCount(session.tokens.cache_read) }}
        </span>
      </div>
      <div class="flex items-center justify-between mt-1.5">
        <span v-if="session.event_count" class="text-[0.6rem] text-ghost">
          {{ session.event_count }} events
        </span>
        <span class="text-xs font-semibold text-amber-glow ml-auto">
          {{ formatCost(calculateCost(session.tokens, session.model)) }}
        </span>
      </div>
    </div>

    <!-- If no tokens but has event count -->
    <div
      v-else-if="session.event_count"
      class="mt-2 pt-2 border-t border-ink-border/60"
    >
      <span class="text-[0.6rem] text-ghost">{{ session.event_count }} events</span>
    </div>
  </div>
</template>
