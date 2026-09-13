/**
 * Relative rotation — where a sector sits against the market and which way
 * it is moving, the two numbers behind a rotation quadrant chart.
 *
 * For an ETF against a benchmark on shared dates:
 *   rs[t]     = etf[t] / bench[t]
 *   ratio[t]  = 100 · rs[t] / mean(rs over the last `ratioWindow` days)
 *   momentum  = 100 · ratio[t] / mean(ratio over the last `momWindow` days)
 * so 100 is "in line with the market" on both axes: above 100 on the ratio
 * the sector has outperformed over the window, above 100 on momentum that
 * outperformance is still building. The four quadrants read clockwise from
 * top right: leading, weakening, lagging, improving. The trail is the same
 * point sampled every `trailStep` days, oldest first.
 *
 * This is the shape of the well-known JdK RS-Ratio / RS-Momentum pair, with
 * plain moving averages in place of the proprietary smoothing. Pure module:
 * no fetching, no React, so `node --test` runs it directly.
 */

export type ClosePoint = { time: string; close: number };
export type RotationPoint = { x: number; y: number; time: string };
export type Quadrant = "leading" | "weakening" | "lagging" | "improving";

export const ROTATION_DEFAULTS = { ratioWindow: 63, momWindow: 10, trailStep: 5, trailPoints: 5 };

export function quadrantOf(p: { x: number; y: number }): Quadrant {
  if (p.x >= 100) return p.y >= 100 ? "leading" : "weakening";
  return p.y >= 100 ? "improving" : "lagging";
}

/** Closes on the dates both series have, ascending. */
export function alignCloses(a: ClosePoint[], b: ClosePoint[]): Array<{ time: string; a: number; b: number }> {
  const bm = new Map<string, number>();
  for (const p of b) if (p.time && p.close > 0) bm.set(p.time, p.close);
  const out: Array<{ time: string; a: number; b: number }> = [];
  const seen = new Set<string>();
  for (const p of a) {
    if (!p.time || !(p.close > 0) || seen.has(p.time)) continue;
    const bc = bm.get(p.time);
    if (bc == null) continue;
    seen.add(p.time);
    out.push({ time: p.time, a: p.close, b: bc });
  }
  return out.sort((x, y) => x.time.localeCompare(y.time));
}

function trailingMean(values: number[], end: number, window: number): number {
  let s = 0;
  for (let i = end - window + 1; i <= end; i++) s += values[i];
  return s / window;
}

export function relativeRotation(
  etf: ClosePoint[],
  bench: ClosePoint[],
  opts: Partial<typeof ROTATION_DEFAULTS> = {},
): { current: RotationPoint; trail: RotationPoint[]; quadrant: Quadrant } | null {
  const { ratioWindow, momWindow, trailStep, trailPoints } = { ...ROTATION_DEFAULTS, ...opts };
  const rows = alignCloses(etf, bench);
  const n = rows.length;
  if (n < ratioWindow + momWindow - 1) return null;

  const rs = rows.map((r) => r.a / r.b);
  // ratio[i] defined for i >= ratioWindow - 1
  const ratio: number[] = new Array(n).fill(NaN);
  for (let i = ratioWindow - 1; i < n; i++) ratio[i] = (100 * rs[i]) / trailingMean(rs, i, ratioWindow);
  // momentum[i] defined for i >= ratioWindow + momWindow - 2
  const firstMom = ratioWindow + momWindow - 2;
  const mom: number[] = new Array(n).fill(NaN);
  for (let i = firstMom; i < n; i++) mom[i] = (100 * ratio[i]) / trailingMean(ratio, i, momWindow);

  const last = n - 1;
  const trail: RotationPoint[] = [];
  for (let k = trailPoints - 1; k >= 0; k--) {
    const i = last - k * trailStep;
    if (i < firstMom) continue;
    trail.push({ x: ratio[i], y: mom[i], time: rows[i].time });
  }
  const current = trail[trail.length - 1];
  return { current, trail, quadrant: quadrantOf(current) };
}

/** Sectors grouped by quadrant, each list in the order given. */
export function groupByQuadrant<T extends { quadrant: Quadrant }>(items: T[]): Record<Quadrant, T[]> {
  const out: Record<Quadrant, T[]> = { leading: [], weakening: [], lagging: [], improving: [] };
  for (const it of items) out[it.quadrant].push(it);
  return out;
}
