/**
 * Margin of Safety is stored as a ratio (intrinsic - price) / intrinsic.
 * For normal stocks it sits in roughly [-1, 1] (e.g. 0.2 = 20% undervalued),
 * but the simple DCF can produce extreme ratios for high-growth / high-beta
 * names (e.g. NVDA intrinsic ~$15 vs $205 → ratio ~ -12.8). Rendering that
 * raw as a percentage gives absurd values like "-1281%", and some call sites
 * forgot the ×100 entirely. This formatter normalises and clamps both cases.
 */
export function formatMoS(mos: number | null | undefined): string | null {
  if (mos == null || Number.isNaN(mos)) return null;
  const pct = mos * 100;
  if (pct > 200) return ">200%";
  if (pct < -100) return "<-100%";
  return `${pct.toFixed(0)}%`;
}
