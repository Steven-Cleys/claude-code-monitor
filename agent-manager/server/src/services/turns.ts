import { sql } from "../db/connection";
import { readTranscriptFile } from "./transcript-reader";
import {
  buildContextTimeline,
  resolveTranscriptFileForSession,
  type ContextPoint,
} from "./xray";

export interface TurnEventRow {
  event_type: string;
  tool_name: string | null;
  created_at: string | Date;
  prompt: string | null;
  file_path: string | null;
}

export interface TurnTokens {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface Turn {
  index: number;
  prompt: string;
  start: string;
  end: string;
  duration_ms: number;
  tool_calls: number;
  failures: number;
  files_touched: string[];
  tokens: TurnTokens;
}

const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

export function buildTurns(rows: TurnEventRow[], points: ContextPoint[]): Turn[] {
  const iso = (v: string | Date) => new Date(v).toISOString();
  const turns: Turn[] = [];
  let current: Turn | null = null;
  const filesTouched = new Map<Turn, Set<string>>();

  for (const row of rows) {
    const ts = iso(row.created_at);
    if (row.event_type === "UserPromptSubmit") {
      current = {
        index: turns.length,
        prompt: row.prompt ?? "",
        start: ts,
        end: ts,
        duration_ms: 0,
        tool_calls: 0,
        failures: 0,
        files_touched: [],
        tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
      };
      turns.push(current);
      filesTouched.set(current, new Set());
      continue;
    }
    if (!current) continue;

    current.end = ts;
    if (row.event_type === "PreToolUse") {
      current.tool_calls++;
      if (row.tool_name && WRITE_TOOLS.has(row.tool_name) && row.file_path) {
        filesTouched.get(current)!.add(row.file_path);
      }
    } else if (row.event_type === "PostToolUseFailure") {
      current.failures++;
    }
  }

  for (const turn of turns) {
    turn.duration_ms = new Date(turn.end).getTime() - new Date(turn.start).getTime();
    turn.files_touched = [...filesTouched.get(turn)!];
  }

  for (const point of points) {
    const turn = turns.findLast((t) => t.start <= point.ts);
    if (!turn) continue;
    turn.tokens.input += point.input;
    turn.tokens.output += point.output;
    turn.tokens.cache_read += point.cache_read;
    turn.tokens.cache_creation += point.cache_creation;
  }

  return turns;
}

export async function buildTurnLedger(sessionId: string) {
  const [session] = await sql`
    SELECT id, cwd FROM sessions WHERE id = ${sessionId} LIMIT 1
  `;
  if (!session) return null;

  const rows = (await sql`
    SELECT event_type, tool_name, created_at,
           payload->>'prompt' as prompt,
           tool_input->>'file_path' as file_path
    FROM events
    WHERE session_id = ${sessionId}
      AND payload->>'agent_id' IS NULL
      AND event_type IN (
        'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
        'Stop', 'StopFailure'
      )
    ORDER BY created_at ASC, id ASC
  `) as unknown as TurnEventRow[];

  let points: ContextPoint[] = [];
  const filePath = await resolveTranscriptFileForSession(
    sessionId,
    (session.cwd as string) ?? null,
  );
  if (filePath) {
    points = buildContextTimeline(await readTranscriptFile(filePath)).points;
  }

  return { session_id: sessionId, turns: buildTurns(rows, points) };
}
