<script setup lang="ts">
defineProps<{
  content: string;
}>();
</script>

<template>
  <div class="px-3 py-1 text-[0.6rem] text-ghost/60 italic">
    &#8943; {{ content }}
  </div>
</template>
