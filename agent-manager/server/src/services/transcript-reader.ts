import { existsSync } from "fs";
import type { TranscriptLine, SubagentMetadata, ContentBlock } from "../types/transcript";

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

export function extractMetadata(
  messages: TranscriptLine[],
  agentId: string,
  sessionId: string,
): Omit<SubagentMetadata, "transcript_path" | "extracted_at"> {
  let model: string | null = null;
  let totalInput = 0;
  let totalOutput = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let toolCallCount = 0;

  for (const msg of messages) {
    if (!msg.message) continue;

    // Record the LAST model seen — if a subagent switches models mid-run,
    // the final turn reflects the model that actually finished the work.
    if (msg.message.model) {
      model = msg.message.model;
    }

    if (msg.message.usage) {
      totalInput += msg.message.usage.input_tokens ?? 0;
      totalOutput += msg.message.usage.output_tokens ?? 0;
      cacheRead += msg.message.usage.cache_read_input_tokens ?? 0;
      cacheCreation += msg.message.usage.cache_creation_input_tokens ?? 0;
    }

    if (Array.isArray(msg.message.content)) {
      for (const block of msg.message.content as ContentBlock[]) {
        if (block.type === "tool_use") toolCallCount++;
      }
    }
  }

  return {
    agent_id: agentId,
    session_id: sessionId,
    model,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheCreation,
    tool_call_count: toolCallCount,
  };
}

export function extractSessionTitle(messages: TranscriptLine[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "ai-title" && msg.aiTitle) return msg.aiTitle;
  }
  return null;
}

// Claude Code's on-disk project hash turns both `/` and `_` into `-`, and
// keeps the leading slash as a leading dash (e.g. `/Users/a/ai_tools/foo`
// → `-Users-a-ai-tools-foo`). The prior implementation stripped the leading
// slash and left underscores alone, which produced a wrong path whenever
// the cwd contained an underscore or was used without an explicit
// `agent_transcript_path` payload.
function cwdToProjectHash(cwd: string): string {
  return cwd.replace(/[/_]/g, "-");
}

export function resolveTranscriptPath(agentId: string, sessionId: string, cwd: string): string {
  return `${CLAUDE_PROJECTS_DIR}/${cwdToProjectHash(cwd)}/${sessionId}/subagents/agent-${agentId}.jsonl`;
}

export function resolveSessionTranscriptPath(sessionId: string, cwd: string): string {
  return `${CLAUDE_PROJECTS_DIR}/${cwdToProjectHash(cwd)}/${sessionId}.jsonl`;
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
  return converted;
}
