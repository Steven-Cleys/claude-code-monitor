import { test, expect, describe } from "bun:test";
import { parseTranscriptLine, extractMetadata } from "../services/transcript-reader";
import type { TranscriptLine } from "../types/transcript";

describe("parseTranscriptLine", () => {
  test("parses an assistant message with text content", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        model: "claude-opus-4-6",
        content: [{ type: "text", text: "Hello world" }],
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 80 },
      },
      timestamp: "2026-04-07T12:00:00.000Z",
      agentId: "abc123",
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("assistant");
    expect(result!.message?.model).toBe("claude-opus-4-6");
    expect(result!.message?.usage?.input_tokens).toBe(100);
  });

  test("parses a user message with string content", () => {
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content: "Do something" },
      timestamp: "2026-04-07T12:00:01.000Z",
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("user");
    expect(result!.message?.content).toBe("Do something");
  });

  test("parses a progress message", () => {
    const line = JSON.stringify({
      type: "progress",
      message: { content: "Searching..." },
      timestamp: "2026-04-07T12:00:02.000Z",
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("progress");
  });

  test("returns null for invalid JSON", () => {
    expect(parseTranscriptLine("not json")).toBeNull();
  });

  test("returns null for empty line", () => {
    expect(parseTranscriptLine("")).toBeNull();
  });

  test("parses tool_use content blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Let me read that file." },
          { type: "tool_use", id: "toolu_123", name: "Read", input: { file_path: "/src/index.ts" } },
        ],
        usage: { input_tokens: 200, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
      timestamp: "2026-04-07T12:00:03.000Z",
    });

    const result = parseTranscriptLine(line);
    const content = result!.message?.content as Array<{ type: string }>;
    expect(content).toHaveLength(2);
    expect(content[1].type).toBe("tool_use");
  });
});

describe("extractMetadata", () => {
  test("extracts model and token sums from messages", () => {
    const messages: TranscriptLine[] = [
      {
        type: "user",
        message: { role: "user", content: "Hello" },
        timestamp: "2026-04-07T12:00:00.000Z",
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "Hi there" }],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 80 },
        },
        timestamp: "2026-04-07T12:00:01.000Z",
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            { type: "text", text: "Let me check." },
            { type: "tool_use", id: "t1", name: "Read", input: {} },
          ],
          usage: { input_tokens: 200, output_tokens: 30, cache_creation_input_tokens: 5, cache_read_input_tokens: 150 },
        },
        timestamp: "2026-04-07T12:00:02.000Z",
      },
    ];

    const meta = extractMetadata(messages, "agent-abc", "session-123");
    expect(meta.model).toBe("claude-opus-4-6");
    expect(meta.total_input_tokens).toBe(300);
    expect(meta.total_output_tokens).toBe(80);
    expect(meta.cache_read_tokens).toBe(230);
    expect(meta.cache_creation_tokens).toBe(15);
    expect(meta.tool_call_count).toBe(1);
  });

  test("handles messages with no usage data", () => {
    const messages: TranscriptLine[] = [
      { type: "user", message: { role: "user", content: "Hello" }, timestamp: "2026-04-07T12:00:00.000Z" },
      { type: "progress", timestamp: "2026-04-07T12:00:01.000Z" },
    ];

    const meta = extractMetadata(messages, "agent-abc", "session-123");
    expect(meta.model).toBeNull();
    expect(meta.total_input_tokens).toBe(0);
    expect(meta.tool_call_count).toBe(0);
  });
});
