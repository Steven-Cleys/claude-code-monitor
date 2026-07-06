// Parse an integer query param, falling back to `def` and clamping to [min, max].
export function clampQueryInt(
  raw: string | undefined,
  def: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(Number(raw) || def, min), max);
}
