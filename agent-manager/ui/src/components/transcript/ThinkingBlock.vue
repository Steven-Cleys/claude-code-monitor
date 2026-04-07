<script setup lang="ts">
import { ref, computed } from "vue";

const props = defineProps<{
  content: string;
}>();

const expanded = ref(false);

const preview = computed(() => {
  const firstLine = props.content.split("\n")[0] ?? "";
  return firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine;
});
</script>

<template>
  <div class="border-l-[3px] border-amber-500 bg-yellow-950/10 rounded-r-md">
    <div
      class="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-yellow-900/10 transition-colors"
      @click="expanded = !expanded"
    >
      <svg
        class="w-2.5 h-2.5 text-ghost shrink-0 transition-transform duration-150"
        :class="{ 'rotate-90': expanded }"
        viewBox="0 0 10 10" fill="currentColor"
      >
        <path d="M3 2l3.5 3L3 8z" />
      </svg>
      <span class="text-[0.6rem] font-semibold tracking-wider text-amber-600">THINKING</span>
      <span v-if="!expanded" class="text-[0.6rem] text-ghost truncate">{{ preview }}</span>
    </div>
    <div v-if="expanded" class="px-3 pb-2">
      <div class="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{{ content }}</div>
    </div>
  </div>
</template>
