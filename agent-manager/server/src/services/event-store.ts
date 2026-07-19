import { sql } from "../db/connection";
import { PASSIVE_EVENTS, SESSION_END_EVENTS, TURN_END_EVENTS } from "../constants";
import { hostPathToContainerPath } from "./transcript-reader";

interface HookEvent {
  session_id: string;
  hook_event_name: string;
  cwd: string;
  permission_mode?: string;
  model?: string;
  transcript_path?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function upsertSession(event: HookEvent) {
  const model = typeof event.model === "string" ? event.model : null;
  // SessionEnd is a deferred cleanup event that can fire hours after the session
  // actually stopped — don't let it bump last_seen or it pollutes time-based filters.
  const isCleanupEvent = event.hook_event_name === "SessionEnd";
  const isEndEvent = (SESSION_END_EVENTS as readonly string[]).includes(event.hook_event_name);
  const isTurnEnd = (TURN_END_EVENTS as readonly string[]).includes(event.hook_event_name);
  const isSessionStart = event.hook_event_name === "SessionStart";
  const isPassiveEvent = (PASSIVE_EVENTS as readonly string[]).includes(event.hook_event_name);
  // Stored as the container-visible path so every reader (scanner, xray) can
  // open it directly; the raw host path stays available in the event payload.
  const transcriptPath = event.transcript_path
    ? hostPathToContainerPath(event.transcript_path)
    : null;

  const [row] = await sql`
    INSERT INTO sessions (id, cwd, permission_mode, model, transcript_path, status, first_seen, last_seen)
    VALUES (${event.session_id}, ${event.cwd ?? null}, ${event.permission_mode ?? null}, ${model}, ${transcriptPath}, ${isEndEvent ? "ended" : isTurnEnd || isPassiveEvent ? "idle" : "active"}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      last_seen = ${isCleanupEvent ? sql`sessions.last_seen` : sql`NOW()`},
      -- Status model: SessionEnd is terminal, SessionStart resurrects a resumed
      -- session, Stop/StopFailure mark a turn boundary (idle), anything else on
      -- a live session means it's active. Late replays (e.g. a deferred
      -- SubagentStop) must NOT resurrect an ended session, and passive events
      -- (idle_prompt notifications, phantom SubagentStops) must NOT flip an
      -- idle session back to active.
      status = CASE
        WHEN ${isEndEvent} THEN 'ended'
        WHEN ${isSessionStart} THEN 'active'
        WHEN sessions.status = 'ended' THEN 'ended'
        WHEN ${isTurnEnd} THEN 'idle'
        WHEN ${isPassiveEvent} THEN sessions.status
        ELSE 'active'
      END,
      cwd = COALESCE(EXCLUDED.cwd, sessions.cwd),
      permission_mode = COALESCE(EXCLUDED.permission_mode, sessions.permission_mode),
      model = COALESCE(EXCLUDED.model, sessions.model),
      transcript_path = COALESCE(EXCLUDED.transcript_path, sessions.transcript_path)
    -- xmax = 0 means the row was inserted (not updated by a concurrent tx)
    RETURNING *, (xmax = 0) AS is_new
  `;

  return { session: row, isNew: row.is_new as boolean };
}

export async function storeEvent(event: HookEvent) {
  const upsertResult = await upsertSession(event);

  // tool_input / tool_response live in their own columns — keeping them in
  // payload too would double the write volume for large tool responses.
  const { tool_input, tool_response, ...payload } = event;

  const [row] = await sql`
    INSERT INTO events (session_id, event_type, tool_name, tool_input, tool_response, payload)
    VALUES (
      ${event.session_id},
      ${event.hook_event_name},
      ${event.tool_name ?? null},
      ${tool_input ? sql.json(tool_input) : null},
      ${tool_response ? sql.json(tool_response) : null},
      ${sql.json(payload)}
    )
    RETURNING id, session_id, event_type, tool_name, tool_input, tool_response,
              payload->>'agent_id' as agent_id, payload->>'agent_type' as agent_type, created_at
  `;

  return { event: row, session: upsertResult };
}

