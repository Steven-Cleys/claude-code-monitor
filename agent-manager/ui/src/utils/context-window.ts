// Model ids with a 1M-token context window per Anthropic's model table,
// matched with includes() like the pricing table. Everything else, Haiku 4.5
// included, counts as 200K unless Claude Code runs it with the "[1m]" suffix.
const MILLION_TOKEN_MODELS = [
  "fable-5", "mythos-5", "opus-5", "sonnet-5", "haiku-5",
  "opus-4-6", "opus-4-7", "opus-4-8", "sonnet-4-6", "[1m]",
];

export function contextWindow(model: string | null): number {
  if (model && MILLION_TOKEN_MODELS.some((id) => model.includes(id))) return 1_000_000;
  return 200_000;
}
