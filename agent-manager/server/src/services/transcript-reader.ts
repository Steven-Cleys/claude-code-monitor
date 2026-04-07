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

    if (msg.message.model && !model) {
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

export function resolveTranscriptPath(agentId: string, sessionId: string, cwd: string): string {
  const projectHash = cwd.replace(/\//g, "-");
  return `${CLAUDE_PROJECTS_DIR}/${projectHash}/${sessionId}/subagents/agent-${agentId}.jsonl`;
}

export function hostPathToContainerPath(hostPath: string): string {
  return hostPath.replace(/^.*\.claude\/projects\//, `${CLAUDE_PROJECTS_DIR}/`);
}
