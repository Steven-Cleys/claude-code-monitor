<script setup lang="ts">
import { eventIcon } from "../utils/format";

defineProps<{
  searchQuery: string;
  activeEventTypes: Set<string>;
  knownEventTypes: string[];
  resultCount: number;
  subagentFilterName: string | null;
}>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  toggleType: [type: string];
  clearFilters: [];
  clearSubagentFilter: [];
}>();

function hasActiveFilters(searchQuery: string, activeEventTypes: Set<string>): boolean {
  return searchQuery.trim().length > 0 || activeEventTypes.size > 0;
}
</script>

<template>
  <div class="px-5 py-3 border-b border-ink-border bg-ink-light/40 backdrop-blur-sm space-y-2.5">
    <!-- Header row -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 bg-cyan-glow/60 rounded-full"></div>
        <span class="text-[0.6rem] uppercase tracking-[0.2em] text-ghost font-semibold font-[family-name:var(--font-display)]">
          Event Stream
        </span>
      </div>
      <span class="chip bg-ink-surface text-ghost-light">{{ resultCount }}</span>
      <button
        v-if="hasActiveFilters(searchQuery, activeEventTypes)"
        class="text-[0.65rem] uppercase tracking-wider text-amber-glow/70 hover:text-amber-glow ml-auto transition-colors"
        @click="emit('clearFilters')"
      >
        Clear filters
      </button>
    </div>

    <!-- Active subagent filter pill -->
    <div v-if="subagentFilterName" class="flex items-center gap-2">
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.65rem] bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
        Agent: {{ subagentFilterName }}
        <button
          class="ml-1 text-indigo-400/70 hover:text-indigo-300 transition-colors"
          @click="emit('clearSubagentFilter')"
        >
          &times;
        </button>
      </span>
    </div>

    <!-- Search input -->
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ghost" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="6.5" cy="6.5" r="5" />
        <path d="M10.5 10.5L14.5 14.5" stroke-linecap="round" />
      </svg>
      <input
        type="text"
        :value="searchQuery"
        placeholder="Search tools, events, inputs..."
        class="w-full bg-ink-mid border border-ink-border rounded pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-ghost/60 focus:outline-none focus:border-cyan-dim transition-colors"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Event type toggles -->
    <div v-if="knownEventTypes.length > 0" class="flex flex-wrap gap-1.5">
      <button
        v-for="type in knownEventTypes"
        :key="type"
        class="text-[0.65rem] px-2.5 py-0.5 rounded border transition-all duration-150"
        :class="
          activeEventTypes.size === 0 || activeEventTypes.has(type)
            ? 'border-ink-border-light bg-ink-surface text-gray-300 hover:border-cyan-dim'
            : 'border-ink-border/50 bg-transparent text-ghost/50 hover:text-ghost'
        "
        @click="emit('toggleType', type)"
      >
        <span class="mr-1">{{ eventIcon(type) }}</span>{{ type }}
      </button>
    </div>
  </div>
</template>
