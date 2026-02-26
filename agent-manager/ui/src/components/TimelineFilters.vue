<script setup lang="ts">
import { eventIcon } from "../utils/format";

defineProps<{
  searchQuery: string;
  activeEventTypes: Set<string>;
  knownEventTypes: string[];
  resultCount: number;
}>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  toggleType: [type: string];
  clearFilters: [];
}>();

function hasActiveFilters(searchQuery: string, activeEventTypes: Set<string>): boolean {
  return searchQuery.trim().length > 0 || activeEventTypes.size > 0;
}
</script>

<template>
  <div class="px-4 py-2 border-b border-gray-800 space-y-2">
    <div class="flex items-center gap-3">
      <h2 class="text-xs font-semibold uppercase text-gray-500">Timeline</h2>
      <span class="text-xs text-gray-600">{{ resultCount }} events</span>
      <button
        v-if="hasActiveFilters(searchQuery, activeEventTypes)"
        class="text-xs text-gray-400 hover:text-gray-200 ml-auto"
        @click="emit('clearFilters')"
      >
        Clear filters
      </button>
    </div>
    <input
      type="text"
      :value="searchQuery"
      placeholder="Search tools, events, inputs..."
      class="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
      @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
    />
    <div v-if="knownEventTypes.length > 0" class="flex flex-wrap gap-1.5">
      <button
        v-for="type in knownEventTypes"
        :key="type"
        class="text-xs px-2 py-0.5 rounded border font-mono transition-colors"
        :class="
          activeEventTypes.size === 0 || activeEventTypes.has(type)
            ? 'border-gray-600 bg-gray-800 text-gray-200'
            : 'border-gray-800 bg-gray-900/50 text-gray-600'
        "
        @click="emit('toggleType', type)"
      >
        {{ eventIcon(type) }} {{ type }}
      </button>
    </div>
  </div>
</template>
