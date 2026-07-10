<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { TimelineEvent as TEvent, Turn } from "../types/events";
import TimelineEvent from "./TimelineEvent.vue";
import EventDetail from "./EventDetail.vue";
import TurnHeader from "./TurnHeader.vue";

const props = defineProps<{
  events: TEvent[];
  expandedEventId: number | null;
  turns?: Turn[];
  sessionModel?: string | null;
}>();

const emit = defineEmits<{
  toggleDetail: [id: number];
}>();

const container = ref<HTMLElement | null>(null);

watch(
  () => props.events.length,
  async () => {
    if (container.value) {
      await nextTick();
      container.value.scrollTop = 0;
    }
  },
);

// Bucket events (newest-first) under their owning turn (the latest turn
// started at or before the event). Both lists are time-sorted, so a single
// forward pointer suffices. Events predating the first prompt fall through
// to `pre` and render flat below the last chapter.
const grouped = computed(() => {
  if (!props.turns || props.turns.length === 0) return null;
  const groups = [...props.turns]
    .sort((a, b) => b.index - a.index)
    .map((turn) => ({
      turn,
      startMs: new Date(turn.start).getTime(),
      events: [] as TEvent[],
    }));
  const pre: TEvent[] = [];
  let i = 0;
  for (const event of props.events) {
    const t = new Date(event.created_at).getTime();
    while (i < groups.length && groups[i]!.startMs > t) i++;
    if (i < groups.length) groups[i]!.events.push(event);
    else pre.push(event);
  }
  return { groups, pre };
});

// Collapse state per turn index; without an explicit toggle, only the newest
// turn is expanded — older chapters read as ledger rows.
const collapseOverrides = ref(new Map<number, boolean>());
const newestTurnIndex = computed(() =>
  props.turns && props.turns.length > 0
    ? Math.max(...props.turns.map((t) => t.index))
    : -1,
);

function isCollapsed(turn: Turn): boolean {
  return collapseOverrides.value.get(turn.index) ?? turn.index !== newestTurnIndex.value;
}

function toggleTurn(turn: Turn) {
  const next = new Map(collapseOverrides.value);
  next.set(turn.index, !isCollapsed(turn));
  collapseOverrides.value = next;
}
</script>

<template>
  <div ref="container" class="overflow-y-auto h-full custom-scrollbar px-2 py-1">
    <template v-if="grouped">
      <template v-for="group in grouped.groups" :key="`turn-${group.turn.index}`">
        <TurnHeader
          :turn="group.turn"
          :model="sessionModel ?? null"
          :collapsed="isCollapsed(group.turn)"
          @toggle="toggleTurn(group.turn)"
        />
        <template v-if="!isCollapsed(group.turn)">
          <template v-for="event in group.events" :key="event.id">
            <TimelineEvent
              :event="event"
              :expanded="expandedEventId === event.id"
              @toggle-detail="emit('toggleDetail', event.id)"
            />
            <EventDetail
              v-if="expandedEventId === event.id"
              :event="event"
              @close="emit('toggleDetail', event.id)"
            />
          </template>
        </template>
      </template>
      <template v-for="event in grouped.pre" :key="event.id">
        <TimelineEvent
          :event="event"
          :expanded="expandedEventId === event.id"
          @toggle-detail="emit('toggleDetail', event.id)"
        />
        <EventDetail
          v-if="expandedEventId === event.id"
          :event="event"
          @close="emit('toggleDetail', event.id)"
        />
      </template>
    </template>
    <TransitionGroup v-else name="event-stream">
      <template v-for="event in events" :key="event.id">
        <TimelineEvent
          :event="event"
          :expanded="expandedEventId === event.id"
          @toggle-detail="emit('toggleDetail', event.id)"
        />
        <EventDetail
          v-if="expandedEventId === event.id"
          :event="event"
          @close="emit('toggleDetail', event.id)"
        />
      </template>
    </TransitionGroup>
    <div v-if="events.length === 0 && !grouped" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-12 h-12 rounded-full border border-ink-border flex items-center justify-center mb-4">
        <div class="w-3 h-3 rounded-full bg-ghost/30 animate-pulse-glow"></div>
      </div>
      <span class="text-ghost text-xs tracking-wide">No events yet.</span>
      <span class="text-ghost/50 text-[0.65rem] mt-1">Waiting for hook data...</span>
    </div>
  </div>
</template>

<style scoped>
.event-stream-enter-active {
  transition: all 0.25s ease-out;
}
.event-stream-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.event-stream-move {
  transition: transform 0.2s ease;
}
</style>
