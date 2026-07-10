import { ref, watch, onUnmounted, type Ref } from "vue";
import type { TimelineEvent, Turn } from "../types/events";

// Turn ledger for the selected session. Fetched on selection, then refetched
// (debounced) as new events stream in so the open turn's counters stay live.
export function useTurns(
  sessionId: Ref<string | null>,
  events: Ref<TimelineEvent[]>,
) {
  const turns = ref<Turn[]>([]);
  let fetchSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function fetchTurns() {
    const id = sessionId.value;
    if (!id) {
      turns.value = [];
      return;
    }
    const seq = ++fetchSeq;
    const res = await fetch(`/api/sessions/${id}/turns`);
    if (!res.ok) return;
    const data = await res.json();
    if (seq !== fetchSeq || sessionId.value !== id) return;
    turns.value = data.turns;
  }

  watch(
    sessionId,
    () => {
      turns.value = [];
      fetchTurns();
    },
    { immediate: true },
  );

  watch(
    () => events.value.length,
    () => {
      if (!sessionId.value) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchTurns, 1500);
    },
  );

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return { turns };
}
