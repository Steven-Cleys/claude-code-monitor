<script setup lang="ts">
defineProps<{
  connected: boolean;
  sessionCount: number;
  eventCount: number;
  activeCount: number;
}>();

function currentTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
</script>

<template>
  <footer class="flex items-center justify-between px-5 py-1.5 border-t border-ink-border bg-ink-light/60 text-[0.6rem] tracking-wide">
    <div class="flex items-center gap-4">
      <span class="text-ghost">
        <span class="text-ghost-light">SES</span> {{ sessionCount }}
      </span>
      <span class="text-ghost">
        <span class="text-ghost-light">EVT</span> {{ eventCount }}
      </span>
      <span v-if="activeCount > 0" class="text-signal-green">
        {{ activeCount }} LIVE
      </span>
    </div>
    <div class="flex items-center gap-4">
      <span class="text-ghost">
        WS {{ connected ? 'CONNECTED' : 'DISCONNECTED' }}
      </span>
      <span class="text-ghost-light">{{ currentTime() }}</span>
    </div>
  </footer>
</template>
