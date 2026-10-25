import { existsSync } from "fs";
import { resolve } from "path";
import type { TranscriptLine, SubagentMetadata, ContentBlock, TokenUsage } from "../types/transcript";

const CLAUDE_PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? "/claude-projects";

export function parseTranscriptLine(line: string): TranscriptLine | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as TranscriptLine;
  } catch {
    return null;
  }
}

export async function readTranscriptFile(filePath: string): Promise<TranscriptLine[]> {
  if (!existsSync(filePath)) return [];
  const content = await Bun.file(filePath).text();
  const messages: TranscriptLine[] = [];
  for (const line of content.split("\n")) {
    const parsed = parseTranscriptLine(line);
    if (parsed) messages.push(parsed);
  }
  return messages;
}

export interface SessionTotals {
  model: string | null;
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
  };
}

// Streamed assistant messages re-emit the same message.id with cumulative
// usage, so the LAST occurrence per id is authoritative; summing every line
// would double-count. Usage-bearing lines without an id each count once.
export function computeSessionTotals(messages: TranscriptLine[]): SessionTotals {
  const usageById = new Map<string, TokenUsage>();
  let anonKey = 0;
  let model: string | null = null;

  for (const msg of messages) {
    if (!msg.message) continue;
    if (msg.message.model) model = msg.message.model;
    if (!msg.message.usage) continue;
    usageById.set(msg.message.id ?? `anon-${anonKey++}`, msg.message.usage);
  }

  const tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const usage of usageById.values()) {
    tokens.input += usage.input_tokens ?? 0;
    tokens.output += usage.output_tokens ?? 0;
    tokens.cache_read += usage.cache_read_input_tokens ?? 0;
    tokens.cache_creation += usage.cache_creation_input_tokens ?? 0;
  }

  return { model, tokens };
}

export interface ContextPoint {
  ts: string;
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
  context: number;
}

// One point per assistant API turn, oldest first. Transcripts repeat the same
// message.id across streamed chunks with cumulative usage, so keep the last line per id.
export function buildContextPoints(messages: TranscriptLine[]): ContextPoint[] {
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

  return [...byId.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

export function extractMetadata(
  messages: TranscriptLine[],
  agentId: string,
  sessionId: string,
): Omit<SubagentMetadata, "transcript_path" | "extracted_at"> {
  // The model is the LAST one seen: if a subagent switches models mid-run,
  // the final turn reflects the model that actually finished the work.
  const { model, tokens } = computeSessionTotals(messages);

  let toolCallCount = 0;
  for (const msg of messages) {
    if (!Array.isArray(msg.message?.content)) continue;
    for (const block of msg.message.content as ContentBlock[]) {
      if (block.type === "tool_use") toolCallCount++;
    }
  }

  return {
    agent_id: agentId,
    session_id: sessionId,
    model,
    total_input_tokens: tokens.input,
    total_output_tokens: tokens.output,
    cache_read_tokens: tokens.cache_read,
    cache_creation_tokens: tokens.cache_creation,
    tool_call_count: toolCallCount,
  };
}

// The title lives in "ai-title" records that Claude Code re-emits as the topic
// evolves — only the LAST one matters. Scan lines from the end with a cheap
// substring pre-filter so a multi-MB transcript doesn't get fully JSON.parsed
// on every turn boundary.
export async function extractSessionTitleFromFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const content = await Bun.file(filePath).text();
  const lines = content.split("\n");
  for (const line of lines.toReversed()) {
    if (!line.includes("ai-title")) continue;
    const parsed = parseTranscriptLine(line);
    if (parsed?.type === "ai-title" && parsed.aiTitle) return parsed.aiTitle;
  }
  return null;
}

// Ids and paths come from hook payloads, which anyone on this machine can
// send, so a `..` segment must not lead out of the projects dir.
function insideProjectsDir(path: string): string | null {
  const resolved = resolve(path);
  return resolved.startsWith(`${CLAUDE_PROJECTS_DIR}/`) ? resolved : null;
}

export function subagentTranscriptPath(sessionTranscriptPath: string, agentId: string): string | null {
  return insideProjectsDir(`${sessionTranscriptPath.replace(/\.jsonl$/, "")}/subagents/agent-${agentId}.jsonl`);
}

// Converts a host path like `/home/user/.claude/projects/<hash>/<id>/...`
// into the container-visible path under CLAUDE_PROJECTS_DIR. Returns null
// when the input doesn't live under a `.claude/projects/` directory — the
// previous silent pass-through produced a garbage path that readTranscriptFile
// then couldn't open, and the failure was invisible.
export function hostPathToContainerPath(hostPath: string): string | null {
  const converted = hostPath.replace(/^.*\.claude\/projects\//, `${CLAUDE_PROJECTS_DIR}/`);
  if (converted === hostPath && !hostPath.startsWith(`${CLAUDE_PROJECTS_DIR}/`)) {
    return null;
  }
  return insideProjectsDir(converted);
}
