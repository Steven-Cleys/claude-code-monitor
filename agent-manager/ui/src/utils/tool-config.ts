export interface ToolVisual {
  emoji: string | null;
  color: string;
  letter: string;
}

const TOOL_MAP: Record<string, ToolVisual> = {
  Read:              { emoji: "👁",  color: "#60a5fa", letter: "R"  },
  Edit:              { emoji: "✏️", color: "#22c55e", letter: "E"  },
  Bash:              { emoji: "⚡", color: "#f59e0b", letter: "B"  },
  Grep:              { emoji: "🔍", color: "#a78bfa", letter: "G"  },
  Glob:              { emoji: "📂", color: "#34d399", letter: "Gl" },
  Write:             { emoji: "📝", color: "#e879f9", letter: "W"  },
  Agent:             { emoji: "🤖", color: "#f87171", letter: "A"  },
  Skill:             { emoji: "🎯", color: "#fbbf24", letter: "Sk" },
  WebSearch:         { emoji: null, color: "#38bdf8", letter: "WS" },
  WebFetch:          { emoji: null, color: "#38bdf8", letter: "WF" },
  TaskCreate:        { emoji: null, color: "#fb923c", letter: "TC" },
  TaskUpdate:        { emoji: null, color: "#fb923c", letter: "TU" },
  TaskList:          { emoji: null, color: "#fb923c", letter: "TL" },
  TaskGet:           { emoji: null, color: "#fb923c", letter: "TG" },
  ToolSearch:        { emoji: null, color: "#94a3b8", letter: "TS" },
  SendMessage:       { emoji: null, color: "#94a3b8", letter: "SM" },
  AskUserQuestion:   { emoji: null, color: "#94a3b8", letter: "AQ" },
  ExitPlanMode:      { emoji: null, color: "#94a3b8", letter: "EP" },
};

const MCP_COLOR = "#64748b";
const UNKNOWN_COLOR = "#64748b";

function abbreviateMcpServer(serverName: string): string {
  return serverName
    .split(/[-_]/)
    .map((part) => part.charAt(0))
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getToolVisual(toolName: string): ToolVisual {
  const known = TOOL_MAP[toolName];
  if (known) return known;

  if (toolName.startsWith("mcp__")) {
    const withoutPrefix = toolName.slice(5);
    const separatorIndex = withoutPrefix.indexOf("__");
    const serverName = separatorIndex >= 0
      ? withoutPrefix.slice(0, separatorIndex)
      : withoutPrefix;
    return { emoji: null, color: MCP_COLOR, letter: abbreviateMcpServer(serverName) };
  }

  return { emoji: null, color: UNKNOWN_COLOR, letter: toolName.slice(0, 2) };
}

export function getAllKnownTools(): string[] {
  return Object.keys(TOOL_MAP);
}
