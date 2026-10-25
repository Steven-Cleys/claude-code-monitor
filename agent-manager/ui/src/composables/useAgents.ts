import { ref, computed, onMounted } from "vue";
import type { Session, Subagent, SubagentMetadata, TimelineEvent, WsMessage } from "../types/events";
import { totalSessionCost } from "../utils/pricing";

// Keep the in-memory event list bounded — matches the fetch limit, so a
// long-lived tab doesn't grow it (and every computed over it) forever.
const MAX_EVENTS = 2000;

export function useAgents() {
  const sessions = ref<Map<string, Session>>(new Map());
  const events = ref<TimelineEvent[]>([]);
  const selectedSessionId = ref<string | null>(null);
  const hoursFilter = ref(4);

  // Holds subagent metadata that arrived via WS before the corresponding
  // subagent was added to UI state (a rare but real race between the
  // `new_event` SubagentStop broadcast and the follow-up
  // `subagent_metadata_updated` broadcast that the server fires async
  // from persistSubagentMetadata). Keyed by agent_id.
  const pendingMetadata = new Map<string, SubagentMetadata>();

  // Stop-only SubagentStops (no SubagentStart, no matching row) are NOT
  // surfaced immediately: phantom suggestion-agents look identical to real
  // anonymous agents at stop time. Real ones leave a transcript, so the
  // subagent_metadata_updated broadcast that follows is the proof-of-life —
  // the row is created there, using the buffered stop's timestamps.
  const pendingStops = new Map<string, { completed_at: string; buffered_at: number }>();
  const PENDING_STOP_TTL_MS = 5 * 60 * 1000;

  function bufferPendingStop(agentId: string, completedAt: string) {
    const now = Date.now();
    for (const [id, stop] of pendingStops) {
      if (now - stop.buffered_at > PENDING_STOP_TTL_MS) pendingStops.delete(id);
    }
    pendingStops.set(agentId, { completed_at: completedAt, buffered_at: now });
  }

  // F2: Search & filter state
  const searchQuery = ref("");
  const activeEventTypes = ref<Set<string>>(new Set());

  // F3: Event detail expansion
  const expandedEventId = ref<number | null>(null);

  // Subagent filter state
  const activeSubagentFilter = ref<{
    sessionId: string;
    name: string;
    dispatchedAt: string;
    completedAt: string | null;
  } | null>(null);

  function filterBySubagent(sessionId: string, agentName: string) {
    if (
      activeSubagentFilter.value?.sessionId === sessionId &&
      activeSubagentFilter.value?.name === agentName
    ) {
      activeSubagentFilter.value = null;
      return;
    }

    const session = sessions.value.get(sessionId);
    if (!session?.subagents) return;

    const agent = session.subagents.find((a) => a.name === agentName);
    if (!agent) return;

    selectedSessionId.value = sessionId;

    activeSubagentFilter.value = {
      sessionId,
      name: agentName,
      dispatchedAt: agent.dispatched_at,
      completedAt: agent.completed_at,
    };
  }

  function clearSubagentFilter() {
    activeSubagentFilter.value = null;
  }

  // Guard against out-of-order responses: switching the hours filter fires a
  // new request while the previous one is in flight, and the SLOWER response
  // must not overwrite the newer range's data.
  let sessionsFetchSeq = 0;
  let eventsFetchSeq = 0;

  async function fetchSessions() {
    const seq = ++sessionsFetchSeq;
    const res = await fetch(`/api/sessions?hours=${hoursFilter.value}`);
    const data: Session[] = await res.json();
    if (seq !== sessionsFetchSeq) return;
    sessions.value = new Map(
      data.map((s) => [
        s.id,
        {
          ...s,
          event_count: Number(s.event_count) || 0,
          // BIGINT columns arrive as strings; only seed tokens once the
          // scanner has written them, so sessions without a transcript keep
          // the "no data" state instead of showing zeros.
          tokens: s.tokens_updated_at
            ? {
                input: Number(s.input_tokens) || 0,
                output: Number(s.output_tokens) || 0,
                cache_read: Number(s.cache_read_tokens) || 0,
                cache_creation: Number(s.cache_creation_tokens) || 0,
              }
            : undefined,
          // NUMERIC arrives as a string too.
          cost_usd: s.cost_usd != null ? Number(s.cost_usd) : null,
        },
      ]),
    );
  }

  async function fetchEvents() {
    const seq = ++eventsFetchSeq;
    const since = new Date(Date.now() - hoursFilter.value * 60 * 60 * 1000).toISOString();
    const res = await fetch(`/api/events?since=${since}&limit=2000`);
    const data = await res.json();
    if (seq !== eventsFetchSeq) return;
    events.value = data;
  }

  function processMessage(msg: WsMessage) {
    switch (msg.type) {
      case "session_created": {
        sessions.value.set(msg.data.id, {
          ...msg.data,
          event_count: 0,
          subagents: [],
          needs_attention: msg.data.needs_attention ?? false,
          attention_since: msg.data.attention_since ?? null,
        });
        break;
      }
      case "new_event": {
        events.value.unshift(msg.data);
        if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS;
        const session = sessions.value.get(msg.data.session_id);
        if (session) {
          session.last_seen = msg.data.created_at;
          // Passive events (idle_prompt notifications, phantom SubagentStops)
          // don't resurrect an idle card — mirrors the server's status CASE.
          // Lifecycle events get their own session_status_changed broadcast.
          if (msg.data.event_type !== "Notification" && msg.data.event_type !== "SubagentStop") {
            session.status = "active";
          }
          session.last_tool = msg.data.tool_name;
          session.event_count = Number(session.event_count ?? 0) + 1;

          // Real-time subagent tracking
          if (msg.data.event_type === "PreToolUse" && msg.data.tool_name === "Agent" && msg.data.tool_input) {
            if (!session.subagents) session.subagents = [];
            session.subagents.push({
              name: (msg.data.tool_input.name as string) ?? `agent-${session.subagents.length + 1}`,
              description: (msg.data.tool_input.description as string) ?? "",
              subagent_type: (msg.data.tool_input.subagent_type as string) ?? null,
              agent_type: null,
              agent_id: null,
              status: "running",
              dispatched_at: msg.data.created_at,
              completed_at: null,
              permission_mode: null,
              last_message: null,
              run_in_background: (msg.data.tool_input.run_in_background as boolean) ?? false,
            });
          }

          // agent_id / agent_type are forwarded at the top-level of the
          // broadcast for SubagentStart/SubagentStop (NOT inside tool_input,
          // which is null for lifecycle events).
          if (msg.data.event_type === "SubagentStart" && msg.data.agent_id) {
            if (!session.subagents) session.subagents = [];
            // Bind the id to the oldest still-unidentified running row —
            // SubagentStart fires right after its PreToolUse/Agent dispatch,
            // so dispatch order and start order match.
            const unbound = session.subagents.find((a) => a.status === "running" && !a.agent_id);
            if (unbound) {
              unbound.agent_id = msg.data.agent_id;
              unbound.agent_type = msg.data.agent_type ?? null;
            } else {
              // Start without a dispatch row (background/workflow spawns fire
              // no PreToolUse/Agent) — surface it as a running row.
              session.subagents.push({
                name: msg.data.agent_id.slice(-8),
                description: "",
                subagent_type: null,
                agent_type: msg.data.agent_type ?? null,
                agent_id: msg.data.agent_id,
                status: "running",
                dispatched_at: msg.data.created_at,
                completed_at: null,
                permission_mode: null,
                last_message: null,
                run_in_background: false,
              });
            }
          }

          if (msg.data.event_type === "SubagentStop" && msg.data.agent_id) {
            if (!session.subagents) session.subagents = [];
            // Match strictly by agent_id (bound at SubagentStart). A blind
            // "first running row" fallback would complete the WRONG row when
            // parallel subagents finish out of dispatch order, or let a
            // phantom stop consume a real running row.
            const row = session.subagents.find((a) => a.agent_id === msg.data.agent_id);
            if (row) {
              row.status = "completed";
              row.completed_at = msg.data.created_at;
              const pending = pendingMetadata.get(msg.data.agent_id);
              if (pending) {
                row.metadata = pending;
                pendingMetadata.delete(msg.data.agent_id);
              }
            } else {
              // Stop-only agent — real (workflow/background) or phantom
              // (suggestion micro-agent). Buffer it; the metadata broadcast
              // that only real agents produce creates the row.
              bufferPendingStop(msg.data.agent_id, msg.data.created_at);
            }
          }
        }
        break;
      }
      case "session_status_changed": {
        const session = sessions.value.get(msg.data.id);
        if (session) {
          session.status = msg.data.status;
          if (msg.data.last_seen) session.last_seen = msg.data.last_seen;
        }
        break;
      }
      case "session_enriched": {
        const session = sessions.value.get(msg.data.id);
        if (session && msg.data.model) session.model = msg.data.model;
        break;
      }
      case "session_metrics": {
        const session = sessions.value.get(msg.data.id);
        if (session) session.tokens = msg.data.tokens;
        break;
      }
      case "session_cost": {
        const session = sessions.value.get(msg.data.id);
        if (session) session.cost_usd = msg.data.cost_usd;
        break;
      }
      case "session_context": {
        const session = sessions.value.get(msg.data.id);
        if (session) session.context = msg.data.context;
        break;
      }
      case "session_title_changed": {
        const session = sessions.value.get(msg.data.id);
        if (session) session.title = msg.data.title;
        break;
      }
      case "session_attention_changed": {
        const session = sessions.value.get(msg.data.id);
        if (session) {
          session.needs_attention = msg.data.needs_attention;
          session.attention_since = msg.data.attention_since;
        }
        break;
      }
      case "subagent_metadata_updated": {
        const session = sessions.value.get(msg.data.session_id);
        const subagent = session?.subagents?.find((a) => a.agent_id === msg.data.agent_id);
        if (subagent) {
          subagent.metadata = msg.data.metadata;
        } else if (session && pendingStops.has(msg.data.agent_id)) {
          // Buffered stop-only agent: metadata only exists when a transcript
          // was written, so this is a real agent (not a suggestion phantom) —
          // surface it now as a completed row.
          const stop = pendingStops.get(msg.data.agent_id)!;
          pendingStops.delete(msg.data.agent_id);
          if (!session.subagents) session.subagents = [];
          session.subagents.push({
            name: msg.data.agent_id.slice(-8),
            description: "",
            subagent_type: null,
            agent_type: null,
            agent_id: msg.data.agent_id,
            status: "completed",
            dispatched_at: stop.completed_at,
            completed_at: stop.completed_at,
            permission_mode: null,
            last_message: null,
            run_in_background: false,
            metadata: msg.data.metadata,
          });
        } else {
          // Subagent may not be in UI state yet — stash the metadata and
          // apply it when SubagentStop later sets agent_id.
          pendingMetadata.set(msg.data.agent_id, msg.data.metadata);
        }
        break;
      }
    }
  }

  // F1: Total cost across all sessions
  const totalCost = computed(() => totalSessionCost(sessions.value.values()));

  const attentionCount = computed(() => {
    let count = 0;
    for (const s of sessions.value.values()) {
      if (s.needs_attention) count += 1;
    }
    return count;
  });

  function matchesSearch(e: TimelineEvent, q: string): boolean {
    if (e.tool_name?.toLowerCase().includes(q)) return true;
    if (e.event_type.toLowerCase().includes(q)) return true;
    if (e.tool_input) {
      for (const v of Object.values(e.tool_input)) {
        if (typeof v === "string" && v.toLowerCase().includes(q)) return true;
      }
    }
    return false;
  }

  // Single pass with all predicates hoisted — this recomputes on every
  // arriving event and every search keystroke.
  const filteredEvents = computed(() => {
    const sessionId = selectedSessionId.value;
    const sub = activeSubagentFilter.value;
    const subStart = sub ? new Date(sub.dispatchedAt).getTime() : 0;
    const subEnd = sub?.completedAt ? new Date(sub.completedAt).getTime() : Date.now();
    const types = activeEventTypes.value;
    const q = searchQuery.value.trim().toLowerCase();

    return events.value.filter((e) => {
      if (sessionId && e.session_id !== sessionId) return false;
      if (sub) {
        if (e.session_id !== sub.sessionId) return false;
        const t = new Date(e.created_at).getTime();
        if (t < subStart || t > subEnd) return false;
      }
      if (types.size > 0 && !types.has(e.event_type)) return false;
      if (q && !matchesSearch(e, q)) return false;
      return true;
    });
  });

  // F2: Known event types across all events
  const knownEventTypes = computed(() => {
    const types = new Set<string>();
    for (const e of events.value) types.add(e.event_type);
    return Array.from(types).sort();
  });

  function toggleEventType(type: string) {
    const set = new Set(activeEventTypes.value);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    activeEventTypes.value = set;
  }

  function clearFilters() {
    searchQuery.value = "";
    activeEventTypes.value = new Set();
    activeSubagentFilter.value = null;
  }

  // F3: Toggle event detail panel
  function toggleEventDetail(id: number) {
    expandedEventId.value = expandedEventId.value === id ? null : id;
  }

  const sortedSessions = computed(() => {
    return Array.from(sessions.value.values()).sort((a, b) => {
      // Attention-needed sessions float to the top, most-recently-flagged first.
      if (a.needs_attention !== b.needs_attention) {
        return a.needs_attention ? -1 : 1;
      }
      if (a.needs_attention && b.needs_attention) {
        const at = a.attention_since ? new Date(a.attention_since).getTime() : 0;
        const bt = b.attention_since ? new Date(b.attention_since).getTime() : 0;
        if (at !== bt) return bt - at;
      }
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });
  });

  onMounted(() => {
    fetchSessions();
    fetchEvents();
  });

  return {
    sessions,
    sortedSessions,
    processMessage,
    filteredEvents,
    selectedSessionId,
    hoursFilter,
    fetchSessions,
    fetchEvents,
    totalCost,
    attentionCount,
    searchQuery,
    activeEventTypes,
    knownEventTypes,
    toggleEventType,
    clearFilters,
    expandedEventId,
    toggleEventDetail,
    activeSubagentFilter,
    filterBySubagent,
    clearSubagentFilter,
  };
}
