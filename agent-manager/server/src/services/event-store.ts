import { sql } from "../db/connection";

interface HookEvent {
  session_id: string;
  hook_event_name: string;
  cwd: string;
  permission_mode?: string;
  model?: string;
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

  const [row] = await sql`
    INSERT INTO sessions (id, cwd, permission_mode, model, status, first_seen, last_seen)
    VALUES (${event.session_id}, ${event.cwd ?? null}, ${event.permission_mode ?? null}, ${model}, 'active', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      last_seen = ${isCleanupEvent ? sql`sessions.last_seen` : sql`NOW()`},
      -- Never resurrect an 'ended' session: late replays (e.g. a deferred
      -- SubagentStop) used to flip status back to 'active' here.
      status = CASE WHEN sessions.status = 'ended' THEN 'ended' ELSE 'active' END,
      cwd = COALESCE(EXCLUDED.cwd, sessions.cwd),
      permission_mode = COALESCE(EXCLUDED.permission_mode, sessions.permission_mode),
      model = COALESCE(EXCLUDED.model, sessions.model)
    -- xmax = 0 means the row was inserted (not updated by a concurrent tx)
    RETURNING *, (xmax = 0) AS is_new
  `;

  return { session: row, isNew: row.is_new as boolean };
}

export async function storeEvent(event: HookEvent) {
  const upsertResult = await upsertSession(event);

  const [row] = await sql`
    INSERT INTO events (session_id, event_type, tool_name, tool_input, tool_response, payload)
    VALUES (
      ${event.session_id},
      ${event.hook_event_name},
      ${event.tool_name ?? null},
      ${event.tool_input ? sql.json(event.tool_input) : null},
      ${event.tool_response ? sql.json(event.tool_response) : null},
      ${sql.json(event)}
    )
    RETURNING id, session_id, event_type, tool_name, tool_input, tool_response, created_at
  `;

  return { event: row, session: upsertResult };
}

