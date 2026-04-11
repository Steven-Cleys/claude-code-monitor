<script setup lang="ts">
import { ref, computed } from "vue";
import type { ContentBlock } from "../../types/events";

const props = defineProps<{
  block: ContentBlock;
  result?: { content: string; is_error: boolean } | null;
}>();

const expanded = ref(true);
const outputExpanded = ref(false);

const MAX_OUTPUT_LINES = 20;

const summary = computed(() => {
  if (!props.block.input) return "";
  const input = props.block.input as Record<string, unknown>;
  if (input.file_path) return `— ${input.file_path}`;
  if (input.command) return `— ${String(input.command).slice(0, 80)}`;
  if (input.pattern) return `— "${input.pattern}"`;
  if (input.query) return `— "${String(input.query).slice(0, 60)}"`;
  if (input.prompt) return `— ${String(input.prompt).slice(0, 60)}...`;
  if (input.description) return `— ${String(input.description).slice(0, 60)}`;
  const firstVal = Object.values(input)[0];
  if (typeof firstVal === "string") return `— ${firstVal.slice(0, 60)}`;
  return "";
});

const resultLines = computed(() => {
  if (!props.result?.content) return [];
  return props.result.content.split("\n");
});

const truncatedResult = computed(() => {
  if (resultLines.value.length <= MAX_OUTPUT_LINES) return props.result?.content ?? "";
  return resultLines.value.slice(0, MAX_OUTPUT_LINES).join("\n");
});

const isResultTruncated = computed(() => resultLines.value.length > MAX_OUTPUT_LINES);
</script>

<template>
  <div class="border-l-[3px] border-amber-500 bg-amber-950/15 rounded-r-md">
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-amber-900/10 transition-colors text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-1.5 min-w-0">
        <svg
          class="w-2.5 h-2.5 text-ghost shrink-0 transition-transform duration-150"
          :class="{ 'rotate-90': expanded }"
          viewBox="0 0 10 10" fill="currentColor"
        >
          <path d="M3 2l3.5 3L3 8z" />
        </svg>
        <span class="text-[0.6rem] font-semibold tracking-wider text-amber-600">TOOL</span>
        <span class="text-[0.7rem] text-amber-300 font-mono">{{ block.name }}</span>
        <span class="text-[0.6rem] text-ghost truncate">{{ summary }}</span>
      </div>
    </button>

    <div v-if="expanded" class="px-3 pb-2">
      <div class="mt-1 p-2 bg-ink/60 rounded border border-ink-border text-[0.65rem]">
        <div class="text-ghost text-[0.55rem] font-semibold tracking-wider mb-1">INPUT</div>
        <pre class="text-gray-400 whitespace-pre-wrap break-all font-mono">{{ JSON.stringify(block.input, null, 2) }}</pre>
      </div>

      <div v-if="result" class="mt-1.5 p-2 bg-ink/60 rounded border border-ink-border text-[0.65rem]">
        <div class="text-ghost text-[0.55rem] font-semibold tracking-wider mb-1">
          OUTPUT
          <span v-if="result.is_error" class="text-red-400 ml-1">ERROR</span>
        </div>
        <pre
          class="whitespace-pre-wrap break-all font-mono"
          :class="result.is_error ? 'text-red-400' : 'text-gray-400'"
        >{{ outputExpanded ? result.content : truncatedResult }}</pre>
        <button
          v-if="isResultTruncated && !outputExpanded"
          class="text-blue-400 text-[0.6rem] mt-1 hover:underline"
          @click.stop="outputExpanded = true"
        >
          Show all ({{ resultLines.length }} lines)
        </button>
      </div>
    </div>
  </div>
</template>
