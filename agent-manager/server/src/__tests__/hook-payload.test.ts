import { test, expect } from "bun:test";
import { hookPayloadSchema } from "../routes/hooks";

test("accepts an MCP tool's array tool_response", () => {
  const result = hookPayloadSchema.safeParse({
    session_id: "sess-1",
    hook_event_name: "PostToolUse",
    tool_name: "mcp__context7__query-docs",
    tool_input: { libraryId: "/honojs/website" },
    tool_response: [{ type: "text", text: "docs" }],
  });

  expect(result.success).toBe(true);
});
