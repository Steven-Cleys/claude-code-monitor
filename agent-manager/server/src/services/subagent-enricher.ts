import { sql } from "../db/connection";

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
}

export async function extractSubagents(sessionId: string): Promise<Subagent[]> {
  // Use SubagentStart as primary source (always fires, even if PreToolUse was missed)
  const starts = await sql`
    SELECT
      payload->>'agent_id' as agent_id,
      payload->>'agent_type' as agent_type,
      created_at as dispatched_at
    FROM events
    WHERE session_id = ${sessionId}
      AND event_type = 'SubagentStart'
    ORDER BY created_at ASC
  `;

  // Get PreToolUse Agent events for names/descriptions (may be incomplete if server was down)
  const dispatches = await sql`
    SELECT
      payload->'tool_input'->>'name' as name,
      payload->'tool_input'->>'description' as description,
      payload->'tool_input'->>'subagent_type' as subagent_type,
      COALESCE((payload->'tool_input'->>'run_in_background')::boolean, false) as run_in_background,
      created_at as dispatched_at
    FROM events
    WHERE session_id = ${sessionId}
      AND event_type = 'PreToolUse'
      AND tool_name = 'Agent'
    ORDER BY created_at ASC
  `;

  const stops = await sql`
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
  `;

  // Index stops by agent_id for lookup
  const stopsByAgentId = new Map(stops.map((s) => [s.agent_id, s]));

  return starts.map((start, i) => {
    const dispatch = dispatches[i] ?? null;
    const stop = stopsByAgentId.get(start.agent_id) ?? null;
    const shortId = start.agent_id?.slice(-8) ?? `${i + 1}`;
    return {
      name: dispatch?.name ?? shortId,
      description: dispatch?.description ?? "",
      subagent_type: dispatch?.subagent_type ?? null,
      agent_type: start.agent_type ?? null,
      agent_id: start.agent_id ?? null,
      status: stop ? "completed" as const : "running" as const,
      dispatched_at: start.dispatched_at,
      completed_at: stop?.completed_at ?? null,
      permission_mode: stop?.permission_mode ?? null,
      last_message: stop?.last_message ?? null,
      run_in_background: dispatch?.run_in_background ?? false,
    };
  });
}
