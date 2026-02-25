import { sql } from "../db/connection";

interface HookEvent {
  session_id: string;
  hook_event_name: string;
  cwd: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function upsertSession(event: HookEvent) {
  await sql`
    INSERT INTO sessions (id, cwd, permission_mode, status, first_seen, last_seen)
    VALUES (${event.session_id}, ${event.cwd}, ${event.permission_mode ?? null}, 'active', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      last_seen = NOW(),
      status = 'active',
      cwd = COALESCE(EXCLUDED.cwd, sessions.cwd),
      permission_mode = COALESCE(EXCLUDED.permission_mode, sessions.permission_mode)
  `;
}

export async function storeEvent(event: HookEvent) {
  await upsertSession(event);

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

  return row;
}

export async function updateSessionModel(sessionId: string, model: string) {
  await sql`
    UPDATE sessions SET model = ${model} WHERE id = ${sessionId}
  `;
}
