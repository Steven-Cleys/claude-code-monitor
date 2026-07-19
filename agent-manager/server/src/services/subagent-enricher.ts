import { sql } from "../db/connection";
import type { SubagentMetadataSummary } from "../types/transcript";

interface Subagent {
  name: string;
  description: string;
  subagent_type: string | null;
  agent_type: string | null;
  agent_id: string | null;
  status: "running" | "completed";
  dispatched_at: string;
  completed_at: string | null;
  permission_mode: string | null;
  last_message: string | null;
  run_in_background: boolean;
  metadata?: SubagentMetadataSummary | null;
}

export async function extractSubagents(sessionId: string): Promise<Subagent[]> {
  // The four sources are independent — query them concurrently.
  const [starts, dispatches, stops, metadataRows] = await Promise.all([
    // Use SubagentStart as primary source (always fires, even if PreToolUse was missed)
    sql`
      SELECT
        payload->>'agent_id' as agent_id,
        payload->>'agent_type' as agent_type,
        created_at as dispatched_at
      FROM events
      WHERE session_id = ${sessionId}
        AND event_type = 'SubagentStart'
      ORDER BY created_at ASC
    `,
    // Get PreToolUse Agent events for names/descriptions (may be incomplete if server was down)
    sql`
      SELECT
        tool_input->>'name' as name,
        tool_input->>'description' as description,
        tool_input->>'subagent_type' as subagent_type,
        COALESCE((tool_input->>'run_in_background')::boolean, false) as run_in_background,
        created_at as dispatched_at
      FROM events
      WHERE session_id = ${sessionId}
        AND event_type = 'PreToolUse'
        AND tool_name = 'Agent'
      ORDER BY created_at ASC
    `,
    sql`
      SELECT
        payload->>'agent_id' as agent_id,
        payload->>'agent_type' as agent_type,
        payload->>'permission_mode' as permission_mode,
        LEFT(payload->>'last_assistant_message', 2000) as last_message,
        created_at as completed_at
      FROM events
      WHERE session_id = ${sessionId}
        AND event_type = 'SubagentStop'
      ORDER BY created_at ASC
    `,
    sql`
      SELECT agent_id, model, total_input_tokens, total_output_tokens,
             cache_read_tokens, cache_creation_tokens, tool_call_count
      FROM subagent_metadata
      WHERE session_id = ${sessionId}
    `,
  ]);
  return buildSubagents({ starts, dispatches, stops, metadataRows });
}

interface StartRow {
  agent_id: string | null;
  agent_type: string | null;
  dispatched_at: string;
}

interface DispatchRow {
  name: string | null;
  description: string | null;
  subagent_type: string | null;
  run_in_background: boolean;
  dispatched_at: string;
}

interface StopRow {
  agent_id: string | null;
  agent_type: string | null;
  permission_mode: string | null;
  last_message: string | null;
  completed_at: string;
}

interface MetaRow {
  agent_id: string;
  model: string | null;
  total_input_tokens: number | string;
  total_output_tokens: number | string;
  cache_read_tokens: number | string;
  cache_creation_tokens: number | string;
  tool_call_count: number | string;
}

// Pure merge of the four event sources into the sidebar's subagent rows.
// Kept separate from the DB queries so it can be unit-tested without Postgres.
export function buildSubagents(rows: {
  starts: StartRow[];
  dispatches: DispatchRow[];
  stops: StopRow[];
  metadataRows: MetaRow[];
}): Subagent[] {
  const { starts, dispatches, stops, metadataRows } = rows;

  const metadataByAgentId = new Map(metadataRows.map((m) => [m.agent_id, m]));

  // Index stops by agent_id for lookup
  const stopsByAgentId = new Map(stops.map((s) => [s.agent_id, s]));

  // Track which PreToolUse events have been consumed to avoid reuse
  const consumedDispatches = new Set<number>();

  const MATCH_WINDOW_MS = 30_000;

  const toMetadata = (meta: MetaRow | null | undefined) =>
    meta
      ? {
          model: meta.model,
          total_input_tokens: Number(meta.total_input_tokens),
          total_output_tokens: Number(meta.total_output_tokens),
          cache_read_tokens: Number(meta.cache_read_tokens),
          cache_creation_tokens: Number(meta.cache_creation_tokens),
          tool_call_count: Number(meta.tool_call_count),
        }
      : null;

  const started: Subagent[] = starts.map((start, i) => {
    const startTime = new Date(start.dispatched_at).getTime();

    // Find the closest PreToolUse/Agent event that:
    // 1. Fired before this SubagentStart
    // 2. Is within the 30-second window
    // 3. Has not already been matched to another SubagentStart
    let bestIndex = -1;
    let bestDelta = Infinity;

    for (let j = 0; j < dispatches.length; j++) {
      if (consumedDispatches.has(j)) continue;
      const dispatchTime = new Date(dispatches[j].dispatched_at).getTime();
      const delta = startTime - dispatchTime;
      if (delta >= 0 && delta <= MATCH_WINDOW_MS && delta < bestDelta) {
        bestDelta = delta;
        bestIndex = j;
      }
    }

    const dispatch = bestIndex !== -1 ? dispatches[bestIndex] : null;
    if (bestIndex !== -1) consumedDispatches.add(bestIndex);

    const stop = stopsByAgentId.get(start.agent_id) ?? null;
    const meta = start.agent_id ? metadataByAgentId.get(start.agent_id) ?? null : null;
    const shortId = start.agent_id?.slice(-8) ?? `${i + 1}`;
    return {
      name: dispatch?.name ?? shortId,
      description: dispatch?.description ?? "",
      subagent_type: dispatch?.subagent_type ?? null,
      agent_type: start.agent_type ?? null,
      agent_id: start.agent_id ?? null,
      status: stop ? ("completed" as const) : ("running" as const),
      dispatched_at: start.dispatched_at,
      completed_at: stop?.completed_at ?? null,
      permission_mode: stop?.permission_mode ?? null,
      last_message: stop?.last_message ?? null,
      run_in_background: dispatch?.run_in_background ?? false,
      metadata: toMetadata(meta),
    };
  });

  // Stop-only subagents: anonymous / workflow / background agents fire only
  // SubagentStop (no SubagentStart, no PreToolUse/Agent), so they never appear
  // in `started`. Surface them as completed rows keyed on the stop, enriched
  // with any metadata extracted on stop. Without a start we have no real
  // dispatch time, so completed_at doubles as dispatched_at.
  const startedAgentIds = new Set(starts.map((s) => s.agent_id));
  const stopOnly: Subagent[] = [];
  for (const stop of stopsByAgentId.values()) {
    if (!stop.agent_id || startedAgentIds.has(stop.agent_id)) continue;
    // Phantom filter: Claude Code's prompt-suggestion micro-agents fire
    // stop-only SubagentStop with empty agent_type and a transcript path that
    // never exists on disk — so no metadata row was ever extracted. Real
    // anonymous agents (workflow/background) leave a transcript and therefore
    // metadata. Typed stop-only agents are kept even without metadata.
    if (!stop.agent_type && !metadataByAgentId.has(stop.agent_id)) continue;
    const shortId = stop.agent_id.slice(-8);
    stopOnly.push({
      name: shortId,
      description: "",
      subagent_type: null,
      agent_type: stop.agent_type ?? null,
      agent_id: stop.agent_id,
      status: "completed" as const,
      dispatched_at: stop.completed_at,
      completed_at: stop.completed_at,
      permission_mode: stop.permission_mode ?? null,
      last_message: stop.last_message ?? null,
      run_in_background: false,
      metadata: toMetadata(metadataByAgentId.get(stop.agent_id)),
    });
  }

  return [...started, ...stopOnly].sort(
    (a, b) => new Date(a.dispatched_at).getTime() - new Date(b.dispatched_at).getTime(),
  );
}
