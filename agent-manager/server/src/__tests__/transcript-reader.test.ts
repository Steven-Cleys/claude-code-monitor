import { test, expect, describe } from "bun:test";
import { parseTranscriptLine, extractMetadata, extractSessionTitleFromFile, resolveSessionTranscriptPath, resolveTranscriptPath, hostPathToContainerPath } from "../services/transcript-reader";
import type { TranscriptLine, ContentBlock } from "../types/transcript";

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

  test("counts usage once per message id when content blocks are split across lines", () => {
    const usage = { input_tokens: 3, output_tokens: 400, cache_creation_input_tokens: 20, cache_read_input_tokens: 1000 };
    const blockLine = (id: string, block: ContentBlock): TranscriptLine => ({
      type: "assistant",
      message: { role: "assistant", id, model: "claude-sonnet-5-5", content: [block], usage },
      timestamp: "2026-10-25T12:00:00.000Z",
    });
    const messages: TranscriptLine[] = [
      blockLine("msg_1", { type: "thinking", thinking: "" }),
      blockLine("msg_1", { type: "text", text: "Reading both files." }),
      blockLine("msg_1", { type: "tool_use", id: "t1", name: "Read", input: {} }),
      blockLine("msg_1", { type: "tool_use", id: "t2", name: "Read", input: {} }),
      blockLine("msg_2", { type: "text", text: "Done." }),
    ];

    const meta = extractMetadata(messages, "agent-abc", "session-123");
    expect(meta.total_input_tokens).toBe(6);
    expect(meta.total_output_tokens).toBe(800);
    expect(meta.cache_read_tokens).toBe(2000);
    expect(meta.cache_creation_tokens).toBe(40);
    expect(meta.tool_call_count).toBe(2);
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

describe("resolveSessionTranscriptPath", () => {
  test("maps every non-alphanumeric character to a dash, like Claude Code does", () => {
    expect(resolveSessionTranscriptPath("sess-1", "/Users/a/ai_tools/my.app"))
      .toBe("/claude-projects/-Users-a-ai-tools-my-app/sess-1.jsonl");
  });

  test("hidden directories produce a double dash", () => {
    expect(resolveSessionTranscriptPath("sess-1", "/Users/a/code/proj/.superpowers-sdd"))
      .toBe("/claude-projects/-Users-a-code-proj--superpowers-sdd/sess-1.jsonl");
  });

  test("spaces become dashes", () => {
    expect(resolveSessionTranscriptPath("sess-1", "/Users/a/My Projects/demo"))
      .toBe("/claude-projects/-Users-a-My-Projects-demo/sess-1.jsonl");
  });
});

describe("path traversal out of the projects dir", () => {
  test("a session id with .. segments resolves to null", () => {
    expect(resolveSessionTranscriptPath("../../etc/x", "/a")).toBeNull();
  });

  test("an agent id with .. segments resolves to null", () => {
    expect(resolveTranscriptPath("x/../../../../../etc/x", "sess-1", "/a")).toBeNull();
  });

  test("a hook transcript path with .. segments resolves to null", () => {
    expect(hostPathToContainerPath("/x/.claude/projects/../../etc/hostname")).toBeNull();
    expect(hostPathToContainerPath("/claude-projects/../etc/hostname")).toBeNull();
  });

  test("a regular hook transcript path maps into the projects dir", () => {
    expect(hostPathToContainerPath("/Users/a/.claude/projects/-Users-a-app/sess-1.jsonl"))
      .toBe("/claude-projects/-Users-a-app/sess-1.jsonl");
  });
});

describe("extractSessionTitleFromFile", () => {
  const dir = `${import.meta.dir}/__fixtures__`;

  async function writeFixture(name: string, lines: unknown[]): Promise<string> {
    const path = `${dir}/${name}`;
    await Bun.write(path, lines.map((l) => JSON.stringify(l)).join("\n"));
    return path;
  }

  test("returns the last ai-title when multiple are present", async () => {
    const path = await writeFixture("title-multi.jsonl", [
      { type: "ai-title", aiTitle: "Early topic", timestamp: "2026-07-06T10:00:00.000Z" },
      { type: "user", message: { role: "user", content: "next question" }, timestamp: "2026-07-06T10:01:00.000Z" },
      { type: "ai-title", aiTitle: "Review remaining project ideas", timestamp: "2026-07-06T10:02:00.000Z" },
    ]);
    expect(await extractSessionTitleFromFile(path)).toBe("Review remaining project ideas");
  });

  test("returns null when no ai-title lines exist", async () => {
    const path = await writeFixture("title-none.jsonl", [
      { type: "user", message: { role: "user", content: "Hello" }, timestamp: "2026-07-06T10:00:00.000Z" },
    ]);
    expect(await extractSessionTitleFromFile(path)).toBeNull();
  });

  test("ignores ai-title lines with an empty title", async () => {
    const path = await writeFixture("title-empty.jsonl", [
      { type: "ai-title", aiTitle: "Real title", timestamp: "2026-07-06T10:00:00.000Z" },
      { type: "ai-title", aiTitle: "", timestamp: "2026-07-06T10:01:00.000Z" },
    ]);
    expect(await extractSessionTitleFromFile(path)).toBe("Real title");
  });

  test("returns null for a missing file", async () => {
    expect(await extractSessionTitleFromFile(`${dir}/does-not-exist.jsonl`)).toBeNull();
  });

  test("skips lines that mention ai-title but are not ai-title records", async () => {
    const path = await writeFixture("title-decoy.jsonl", [
      { type: "ai-title", aiTitle: "Real title", timestamp: "2026-07-06T10:00:00.000Z" },
      { type: "user", message: { role: "user", content: 'discussing the ai-title feature' }, timestamp: "2026-07-06T10:01:00.000Z" },
    ]);
    expect(await extractSessionTitleFromFile(path)).toBe("Real title");
  });
});
