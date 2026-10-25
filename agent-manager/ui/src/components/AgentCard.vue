<script setup lang="ts">
import { computed } from "vue";
import type { Session, Subagent } from "../types/events";
import { shortId, timeSince, formatTokenCount, formatCost, modelTier } from "../utils/format";
import { sessionCost } from "../utils/pricing";
import { contextWindow } from "../utils/context-window";
import { getSessionColor } from "../composables/useSessionColors";
import SubagentTree from "./SubagentTree.vue";

const props = defineProps<{
  session: Session;
  selected: boolean;
  activeSubagentFilter: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  filterByAgent: [sessionId: string, agentName: string];
  inspectAgent: [subagent: Subagent];
  inspectSession: [session: Session];
}>();

function cwdShort(cwd: string | null): string {
  if (!cwd) return "";
  const parts = cwd.split("/");
  return parts.slice(-2).join("/");
}

const cost = computed(() => sessionCost(props.session));

const contextWindowTokens = computed(() => contextWindow(props.session.model));

const contextPct = computed(() => {
  if (!props.session.context) return null;
  return Math.min(100, Math.round((props.session.context.tokens / contextWindowTokens.value) * 100));
});

const contextBarClass = computed(() => {
  const pct = contextPct.value ?? 0;
  if (pct >= 85) return "bg-signal-red";
  if (pct >= 60) return "bg-amber-glow";
  return "bg-signal-green";
});

async function dismissAttention() {
  try {
    await fetch(`/api/sessions/${props.session.id}/dismiss-attention`, {
      method: "POST",
    });
    // No local mutation — the server broadcast flips the flag reactively.
  } catch (err) {
    console.error("Failed to dismiss attention:", err);
  }
}
</script>

<template>
  <div
    class="rounded border p-3 cursor-pointer transition-all duration-200 group relative"
    :class="[
      selected
        ? 'border-amber-glow/40 bg-amber-glow/5 glow-amber'
        : 'border-ink-border bg-ink-mid/50 hover:border-ink-border-light hover:bg-ink-mid',
      session.needs_attention
        ? 'ring-2 ring-amber-glow/70 ring-offset-1 ring-offset-ink animate-pulse'
        : '',
    ]"
    @click="emit('select', session.id)"
  >
    <!-- Attention badge — appears only when the session is blocked on user input -->
    <button
      v-if="session.needs_attention"
      class="absolute -top-2 -right-2 text-[0.55rem] font-semibold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-glow text-ink border border-amber-glow shadow-md hover:bg-amber-glow/90 transition-colors z-10"
      :title="session.attention_since ? `Waiting ${timeSince(session.attention_since)} — click to dismiss` : 'Click to dismiss'"
      @click.stop="dismissAttention"
    >
      ⚠ WAITING<span v-if="session.attention_since"> · {{ timeSince(session.attention_since) }}</span>
    </button>

    <!-- Header row: status + ID + time -->
    <div class="flex items-center gap-2 mb-2">
      <span class="w-2 h-2 rounded-full shrink-0" :class="`status-${session.status}`" />
      <span class="text-xs font-semibold tracking-wider" :style="{ color: getSessionColor(session.id) }">
        {{ shortId(session.id) }}
      </span>
      <span class="text-[0.6rem] uppercase tracking-wider ml-auto" :class="{
        'text-signal-green': session.status === 'active',
        'text-signal-yellow': session.status === 'idle',
        'text-ghost': session.status === 'ended',
      }">
        {{ session.status }}
      </span>
      <button
        class="text-[0.6rem] px-1.5 py-0.5 rounded border border-ink-border text-ghost hover:text-cyan-glow hover:border-cyan-glow/40 transition-colors"
        title="View main transcript"
        @click.stop="emit('inspectSession', session)"
      >
        view
      </button>
    </div>

    <!-- AI-generated session title ("what is this agent doing") -->
    <div
      v-if="session.title"
      class="text-xs text-ghost-light font-medium truncate mb-1.5"
      :title="session.title"
    >
      {{ session.title }}
    </div>

    <!-- Model + time row -->
    <div class="flex items-center justify-between mb-1.5">
      <span class="chip bg-ink-surface/80 text-cyan-glow border border-ink-border">
        {{ modelTier(session.model) }}
      </span>
      <span class="text-[0.6rem] text-ghost">{{ timeSince(session.last_seen) }}</span>
    </div>

    <!-- Context window fill -->
    <div
      v-if="contextPct !== null"
      class="flex items-center gap-2 mb-1.5"
      :title="`Context: ${formatTokenCount(session.context!.tokens)} / ${formatTokenCount(contextWindowTokens)} tokens`"
    >
      <div class="flex-1 h-1 rounded-full bg-ink-surface overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500"
          :class="contextBarClass"
          :style="{ width: `${contextPct}%` }"
        ></div>
      </div>
      <span class="text-[0.6rem] tabular-nums shrink-0" :class="contextPct >= 85 ? 'text-signal-red' : 'text-ghost'">
        CTX {{ contextPct }}%
      </span>
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
        <span
          class="text-xs font-semibold text-amber-glow ml-auto"
          :title="cost.estimated ? 'Estimated from tokens' : 'Reported by Claude Code'"
        >
          {{ cost.estimated ? "≈" : "" }}{{ formatCost(cost.usd) }}
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

    <!-- Subagent orchestration tree -->
    <SubagentTree
      v-if="session.subagents && session.subagents.length > 0"
      :subagents="session.subagents"
      :active-filter="selected ? activeSubagentFilter : null"
      @filter-by-agent="(name) => emit('filterByAgent', session.id, name)"
      @inspect-agent="emit('inspectAgent', $event)"
    />
  </div>
</template>
