interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
}

// List prices per MTok (cache read ~0.1x input, cache write ~1.25x input at 5m TTL;
// Fable/Mythos 5.1 and Opus 5.5 read cache cheaper). Matched with includes(), first
// hit wins, so a versioned id like "opus-5-5" must come before "opus-5".
const PRICING_TABLE: { match: string; pricing: ModelPricing }[] = [
  {
    match: "fable-5-1",
    pricing: { inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 0.25, cacheWritePerMillion: 12.5 },
  },
  {
    match: "fable-5",
    pricing: { inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 1, cacheWritePerMillion: 12.5 },
  },
  {
    match: "mythos-5-1",
    pricing: { inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 0.25, cacheWritePerMillion: 12.5 },
  },
  {
    match: "mythos-5",
    pricing: { inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 1, cacheWritePerMillion: 12.5 },
  },
  {
    match: "opus-5-5",
    pricing: { inputPerMillion: 4, outputPerMillion: 20, cacheReadPerMillion: 0.2, cacheWritePerMillion: 5 },
  },
  {
    match: "opus-5",
    pricing: { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  },
  {
    match: "opus-4",
    pricing: { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.5, cacheWritePerMillion: 6.25 },
  },
  {
    match: "sonnet-4",
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  },
  {
    match: "sonnet-5",
    pricing: { inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.2, cacheWritePerMillion: 2.5 },
  },
  {
    match: "claude-3-5-sonnet",
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  },
  // Haiku 5.5 costs 5x more per call when the prompt exceeds 100K tokens. Totals
  // don't carry per-call prompt size, so this uses the short-prompt rate.
  {
    match: "haiku-5",
    pricing: { inputPerMillion: 0.1, outputPerMillion: 0.5, cacheReadPerMillion: 0.01, cacheWritePerMillion: 0.125 },
  },
  {
    match: "haiku-4",
    pricing: { inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.1, cacheWritePerMillion: 1.25 },
  },
  {
    match: "claude-3-5-haiku",
    pricing: { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  },
];

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 };

function getPricing(model: string | null | undefined): ModelPricing {
  if (!model) return DEFAULT_PRICING;
  const lower = model.toLowerCase();
  for (const entry of PRICING_TABLE) {
    if (lower.includes(entry.match)) return entry.pricing;
  }
  return DEFAULT_PRICING;
}

export function calculateCost(tokens: Record<string, number> | undefined, model: string | null | undefined): number {
  if (!tokens) return 0;
  const p = getPricing(model);
  const input = (tokens.input ?? 0) / 1_000_000 * p.inputPerMillion;
  const output = (tokens.output ?? 0) / 1_000_000 * p.outputPerMillion;
  const cacheRead = (tokens.cache_read ?? 0) / 1_000_000 * p.cacheReadPerMillion;
  const cacheWrite = (tokens.cache_creation ?? 0) / 1_000_000 * p.cacheWritePerMillion;
  return input + output + cacheRead + cacheWrite;
}

export interface SessionCost {
  usd: number;
  estimated: boolean;
}

interface CostSource {
  cost_usd?: number | null;
  tokens?: Record<string, number>;
  model: string | null;
}

// Claude Code's reported cost covers every API call, subagents included. The
// estimate only sees the session transcript's tokens at list price.
export function sessionCost(session: CostSource): SessionCost {
  if (session.cost_usd != null) return { usd: session.cost_usd, estimated: false };
  return { usd: calculateCost(session.tokens, session.model), estimated: true };
}

export function totalSessionCost(sessions: Iterable<CostSource>): SessionCost {
  const total = { usd: 0, estimated: false };
  for (const session of sessions) {
    const cost = sessionCost(session);
    total.usd += cost.usd;
    if (cost.estimated && cost.usd > 0) total.estimated = true;
  }
  return total;
}
