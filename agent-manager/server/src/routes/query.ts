// Parse an integer query param, falling back to `def` and clamping to [min, max].
export function clampQueryInt(
  raw: string | undefined,
  def: number,
  min: number,
  max: number,
): number {
  const value = Math.trunc(Number(raw));
  if (!raw || !Number.isFinite(value)) return def;
  return Math.min(Math.max(value, min), max);
}
