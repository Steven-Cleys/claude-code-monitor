import { test, expect, describe } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { latestContextPoint, readSessionContext } from "../services/context-poller";

const line = (obj: unknown) => JSON.stringify(obj);

function assistantLine(id: string, ts: string, context: number, output = 10) {
  return line({
    type: "assistant",
    timestamp: ts,
    message: {
      role: "assistant",
      id,
      usage: {
        input_tokens: 100,
        output_tokens: output,
        cache_read_input_tokens: context - 100,
        cache_creation_input_tokens: 0,
      },
    },
  });
}

describe("latestContextPoint", () => {
  test("returns the newest assistant usage from a transcript tail", () => {
    const tail = [
      assistantLine("msg_1", "2026-07-10T10:00:00Z", 50_000),
      line({ type: "user", timestamp: "2026-07-10T10:00:05Z", message: { role: "user", content: "hi" } }),
      assistantLine("msg_2", "2026-07-10T10:00:10Z", 120_000),
    ].join("\n");

    const point = latestContextPoint(tail);

    expect(point?.context).toBe(120_000);
    expect(point?.ts).toBe("2026-07-10T10:00:10Z");
  });

  test("survives a partial first line from a mid-file tail cut", () => {
    const full = assistantLine("msg_1", "2026-07-10T10:00:00Z", 80_000);
    const tail = full.slice(25) + "\n" + assistantLine("msg_2", "2026-07-10T10:00:10Z", 90_000);

    expect(latestContextPoint(tail)?.context).toBe(90_000);
  });

  test("returns null when the tail has no assistant usage", () => {
    const tail = line({ type: "user", timestamp: "2026-07-10T10:00:00Z", message: { role: "user", content: "hi" } });

    expect(latestContextPoint(tail)).toBeNull();
  });
});

describe("readSessionContext", () => {
  test("reads the newest context from the stored transcript path", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "context-")), "session.jsonl");
    writeFileSync(path, assistantLine("msg_1", "2026-07-10T10:00:00Z", 70_000) + "\n");

    expect(await readSessionContext(path)).toEqual({ tokens: 70_000, ts: "2026-07-10T10:00:00Z" });
  });

  test("returns null for a session without a transcript path", async () => {
    expect(await readSessionContext(null)).toBeNull();
  });
});
