import { sql } from "../db/connection";
import {
  readTranscriptFile,
  resolveSessionTranscriptPath,
  hostPathToContainerPath,
} from "./transcript-reader";
import { extractSubagents } from "./subagent-enricher";
import type { TranscriptLine } from "../types/transcript";

export interface FlowNode {
  tool: string;
  count: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  count: number;
}

export interface FlowLoop {
  pattern: string[];
  count: number;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
  loops: FlowLoop[];
}

export interface ContextPoint {
  ts: string;
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  context: number;
}

export interface ContextTimeline {
  points: ContextPoint[];
  compactions: string[];
}

export type SegmentKind = "working" | "waiting_user" | "waiting_permission";

export interface FrictionSegment {
  kind: SegmentKind;
  start: string;
  end: string;
}

export interface FrictionFailure {
  tool: string;
  ts: string;
}

export interface SlowCall {
  tool: string;
  ts: string;
  ms: number;
}

export interface Friction {
  segments: FrictionSegment[];
  failures: FrictionFailure[];
  slowest: SlowCall[];
  totals: {
    working_ms: number;
    waiting_user_ms: number;
    waiting_permission_ms: number;
    failure_count: number;
    tool_call_count: number;
  };
}

export interface XrayEventRow {
  event_type: string;
  tool_name: string | null;
  created_at: string | Date;
  notification_type: string | null;
}

export function buildFlow(tools: string[]): Flow {
  const nodeCounts = new Map<string, number>();
  const edgeCounts = new Map<string, FlowEdge>();

  let prev: string | null = null;
  for (const tool of tools) {
    nodeCounts.set(tool, (nodeCounts.get(tool) ?? 0) + 1);
    if (prev !== null) {
      const key = `${prev} ${tool}`;
      const edge = edgeCounts.get(key);
      if (edge) edge.count++;
      else edgeCounts.set(key, { from: prev, to: tool, count: 1 });
    }
    prev = tool;
  }

  const nodes = [...nodeCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);
  const edges = [...edgeCounts.values()].sort((a, b) => b.count - a.count);

  return { nodes, edges, loops: findLoops(tools) };
}

// Detect consecutively repeated tool patterns (e.g. Edit→Bash→Edit→Bash→…),
// the "test-fix cycle" signal. Greedy scan: at each position try pattern
// lengths 2-4 and take the one covering the most calls; 3+ repeats counts.
export function findLoops(tools: string[]): FlowLoop[] {
  const found: FlowLoop[] = [];
  let i = 0;
  while (i < tools.length) {
    let best: { len: number; repeats: number } | null = null;
    for (let len = 2; len <= 4; len++) {
      const pattern = tools.slice(i, i + len);
      if (pattern.length < len || new Set(pattern).size === 1) continue;
      let repeats = 1;
      while (
        tools
          .slice(i + repeats * len, i + (repeats + 1) * len)
          .every((t, k) => t === pattern[k]) &&
        i + (repeats + 1) * len <= tools.length
      ) {
        repeats++;
      }
      if (repeats >= 3 && (!best || repeats * len > best.repeats * best.len)) {
        best = { len, repeats };
      }
    }
    if (best) {
      found.push({ pattern: tools.slice(i, i + best.len), count: best.repeats });
      i += best.len * best.repeats;
    } else {
      i++;
    }
  }

  const merged = new Map<string, FlowLoop>();
  for (const loop of found) {
    const key = loop.pattern.join(" ");
    const existing = merged.get(key);
    if (existing) existing.count += loop.count;
    else merged.set(key, { ...loop });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
}

// One point per assistant API turn. Transcripts repeat the same message.id
// across streamed chunks with cumulative usage — keep the last line per id.
export function buildContextTimeline(messages: TranscriptLine[]): ContextTimeline {
  const byId = new Map<string, ContextPoint>();
  let anonCounter = 0;

  for (const msg of messages) {
    const usage = msg.message?.usage;
    if (msg.type !== "assistant" || !usage) continue;
    const id = msg.message?.id ?? `anon-${anonCounter++}`;
    const input = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    byId.set(id, {
      ts: msg.timestamp,
      input,
      cache_read: cacheRead,
      cache_creation: cacheCreation,
      output: usage.output_tokens ?? 0,
      context: input + cacheRead + cacheCreation,
    });
  }

  const points = [...byId.values()].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );

  const compactions: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1]!;
    const point = points[i]!;
    if (before.context > 20_000 && point.context < before.context * 0.7) {
      compactions.push(point.ts);
    }
  }

  return { points, compactions };
}

export function buildFriction(rows: XrayEventRow[]): Friction {
  const segments: FrictionSegment[] = [];
  const failures: FrictionFailure[] = [];
  const durations: SlowCall[] = [];
  const pendingPre = new Map<string, string>();
  let toolCallCount = 0;

  const iso = (v: string | Date) => new Date(v).toISOString();

  let state: SegmentKind = "working";
  let stateStart: string | null = rows.length > 0 ? iso(rows[0]!.created_at) : null;

  const transition = (kind: SegmentKind, ts: string) => {
    if (state === kind || stateStart === null) {
      if (stateStart === null) stateStart = ts;
      return;
    }
    if (ts > stateStart) segments.push({ kind: state, start: stateStart, end: ts });
    state = kind;
    stateStart = ts;
  };

  for (const row of rows) {
    const ts = iso(row.created_at);
    switch (row.event_type) {
      case "UserPromptSubmit":
        transition("working", ts);
        break;
      case "Stop":
      case "StopFailure":
        transition("waiting_user", ts);
        break;
      case "PermissionRequest":
        transition("waiting_permission", ts);
        break;
      case "Notification":
        if (row.notification_type === "permission_prompt") transition("waiting_permission", ts);
        break;
      case "PreToolUse":
        toolCallCount++;
        if (row.tool_name) pendingPre.set(row.tool_name, ts);
        transition("working", ts);
        break;
      case "PostToolUse":
      case "PostToolUseFailure": {
        if (row.event_type === "PostToolUseFailure") {
          failures.push({ tool: row.tool_name ?? "unknown", ts });
        }
        const preTs = row.tool_name ? pendingPre.get(row.tool_name) : undefined;
        if (preTs && row.tool_name) {
          durations.push({ tool: row.tool_name, ts: preTs, ms: new Date(ts).getTime() - new Date(preTs).getTime() });
          pendingPre.delete(row.tool_name);
        }
        transition("working", ts);
        break;
      }
    }
  }

  if (rows.length > 0 && stateStart !== null) {
    const lastTs = iso(rows[rows.length - 1]!.created_at);
    if (lastTs > stateStart) segments.push({ kind: state, start: stateStart, end: lastTs });
  }

  const totals = {
    working_ms: 0,
    waiting_user_ms: 0,
    waiting_permission_ms: 0,
    failure_count: failures.length,
    tool_call_count: toolCallCount,
  };
  for (const seg of segments) {
    const ms = new Date(seg.end).getTime() - new Date(seg.start).getTime();
    if (seg.kind === "working") totals.working_ms += ms;
    else if (seg.kind === "waiting_user") totals.waiting_user_ms += ms;
    else totals.waiting_permission_ms += ms;
  }

  return {
    segments,
    failures,
    slowest: durations.sort((a, b) => b.ms - a.ms).slice(0, 5),
    totals,
  };
}

export async function buildXray(sessionId: string) {
  const [session] = await sql`
    SELECT id, title, model, project, cwd, status, first_seen, last_seen
    FROM sessions WHERE id = ${sessionId} LIMIT 1
  `;
  if (!session) return null;

  const rows = (await sql`
    SELECT event_type, tool_name, created_at,
           payload->>'notification_type' as notification_type
    FROM events
    WHERE session_id = ${sessionId}
      AND payload->>'agent_id' IS NULL
      AND event_type IN (
        'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit',
        'Stop', 'StopFailure', 'Notification', 'PermissionRequest'
      )
    ORDER BY created_at ASC, id ASC
  `) as unknown as XrayEventRow[];

  const tools = rows
    .filter((r) => r.event_type === "PreToolUse" && r.tool_name)
    .map((r) => r.tool_name as string);

  // Hook payloads carry the transcript path directly — prefer it over deriving
  // from session.cwd, which drifts when the user cd's away from the project dir.
  const [pathRow] = await sql`
    SELECT payload->>'transcript_path' as transcript_path
    FROM events
    WHERE session_id = ${sessionId}
      AND payload->>'agent_id' IS NULL
      AND payload->>'transcript_path' IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  `;

  let filePath = pathRow?.transcript_path
    ? hostPathToContainerPath(pathRow.transcript_path as string)
    : null;
  if (!filePath && session.cwd) {
    filePath = resolveSessionTranscriptPath(sessionId, session.cwd as string);
  }

  let context: ContextTimeline = { points: [], compactions: [] };
  if (filePath) {
    const messages = await readTranscriptFile(filePath);
    context = buildContextTimeline(messages);
  }

  const { cwd: _cwd, ...sessionInfo } = session;
  return {
    session: sessionInfo,
    flow: buildFlow(tools),
    context,
    friction: buildFriction(rows),
    fanout: await extractSubagents(sessionId),
  };
}
