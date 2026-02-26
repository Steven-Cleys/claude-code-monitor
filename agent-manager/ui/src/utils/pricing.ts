interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
}

const PRICING_TABLE: { match: string; pricing: ModelPricing }[] = [
  {
    match: "opus-4",
    pricing: { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5 },
  },
  {
    match: "sonnet-4",
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 },
  },
  {
    match: "claude-3-5-sonnet",
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 },
  },
  {
    match: "haiku-4",
    pricing: { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08 },
  },
  {
    match: "claude-3-5-haiku",
    pricing: { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08 },
  },
];

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 };

export function getPricing(model: string | null | undefined): ModelPricing {
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
  const cache = (tokens.cache_read ?? 0) / 1_000_000 * p.cacheReadPerMillion;
  return input + output + cache;
}
