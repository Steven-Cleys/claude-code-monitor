<script setup lang="ts">
import { ref } from "vue";
import type { Subagent } from "../types/events";

defineProps<{
  subagents: Subagent[];
  activeFilter: string | null;
}>();

const emit = defineEmits<{
  filterByAgent: [name: string];
  inspectAgent: [subagent: Subagent];
}>();

const collapsed = ref(false);

function statusDotClass(status: string): string {
  return status === "running"
    ? "bg-signal-green animate-pulse-glow"
    : "bg-ghost/60";
}

function statusLabel(status: string): string {
  return status === "running" ? "RUNNING" : "DONE";
}

// Map a full model id (e.g. claude-haiku-4-5-20251001) to a short tier label.
// Falls back to the second hyphen-separated segment so future model families
// don't silently get mislabeled as "haiku".
function modelTier(model: string | null | undefined): string {
  if (!model) return "?";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.split("-").slice(1, 3).join("-") || model;
}
</script>

<template>
  <div v-if="subagents.length > 0" class="mt-2 pt-2 border-t border-ink-border/60">
    <!-- Header with toggle -->
    <button
      class="flex items-center gap-1.5 w-full text-left mb-1.5 group"
      @click.stop="collapsed = !collapsed"
    >
      <svg
        class="w-2.5 h-2.5 text-ghost transition-transform duration-200"
        :class="{ '-rotate-90': collapsed }"
        viewBox="0 0 10 10"
        fill="currentColor"
      >
        <path d="M2 3l3 3.5L8 3z" />
      </svg>
      <span class="text-[0.6rem] uppercase tracking-[0.15em] text-ghost font-semibold">
        Agents
      </span>
      <span class="chip bg-ink-surface text-ghost-light text-[0.55rem]">{{ subagents.length }}</span>
    </button>

    <!-- Subagent nodes -->
    <div
      v-if="!collapsed"
      class="ml-2 border-l border-ink-border/40 pl-2.5 space-y-1"
    >
      <!--
        Each row is a div + tabindex/role/keyboard rather than a <button>
        because it contains a nested <button> (the inspect-transcript icon),
        and a button-in-button is invalid HTML.
      -->
      <div
        v-for="agent in subagents"
        :key="agent.name"
        class="flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-all duration-150 group/node focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
        :class="
          activeFilter === agent.name
            ? 'bg-indigo-500/10 border border-indigo-500/30'
            : 'hover:bg-ink-surface/60 border border-transparent'
        "
        role="button"
        tabindex="0"
        :aria-pressed="activeFilter === agent.name"
        @click.stop="emit('filterByAgent', agent.name)"
        @keydown.enter.prevent="emit('filterByAgent', agent.name)"
        @keydown.space.prevent="emit('filterByAgent', agent.name)"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="statusDotClass(agent.status)" />
        <span class="text-[0.65rem] font-mono text-indigo-300 truncate" :title="agent.name">{{ agent.name }}</span>
        <span
          v-if="agent.subagent_type || agent.agent_type"
          class="text-[0.5rem] px-1 rounded bg-ink-surface text-ghost-light border border-ink-border shrink-0 truncate max-w-[7rem]"
          :title="agent.subagent_type || agent.agent_type || ''"
        >
          {{ agent.subagent_type || agent.agent_type }}
        </span>
        <span
          v-if="agent.metadata?.model"
          class="text-[0.5rem] px-1 rounded bg-indigo-900/30 text-purple-300 border border-indigo-700/30 shrink-0"
        >
          {{ modelTier(agent.metadata.model) }}
        </span>
        <span
          class="text-[0.55rem] uppercase tracking-wider ml-auto shrink-0"
          :class="agent.status === 'running' ? 'text-signal-green' : 'text-ghost-light'"
        >
          {{ statusLabel(agent.status) }}
        </span>
        <button
          type="button"
          class="shrink-0 p-1 rounded text-indigo-400/70 hover:text-purple-300 hover:bg-purple-500/15 transition-colors"
          :title="'View transcript for ' + agent.name"
          :aria-label="'View transcript for ' + agent.name"
          @click.stop="emit('inspectAgent', agent)"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h12M2 6h10M2 9h8M2 12h6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
