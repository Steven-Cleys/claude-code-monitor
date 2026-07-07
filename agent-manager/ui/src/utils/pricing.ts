interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
}

// List prices per MTok (cache read ~0.1x input, cache write ~1.25x input at 5m TTL).
const PRICING_TABLE: { match: string; pricing: ModelPricing }[] = [
  {
    match: "fable-5",
    pricing: { inputPerMillion: 10, outputPerMillion: 50, cacheReadPerMillion: 1, cacheWritePerMillion: 12.5 },
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
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  },
  {
    match: "claude-3-5-sonnet",
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
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
