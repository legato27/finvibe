/**
 * Book-aware risk — how many bets a book really holds.
 *
 * A portfolio page lists names; a trader is exposed to bets. Eight bitcoin
 * miners filed under three sectors move as one position, and a sector cap
 * never notices. This module joins the user's holdings to daily returns and
 * answers, in order: how many independent bets the book holds, which names
 * form each bet, how large the largest bet is, how the book leans against
 * the market, and which of the ranked book's six factors it is tilted
 * toward.
 *
 * Pure functions only. Nothing here fetches, reads the DOM, or knows about
 * React, so it runs under `node --test` with no harness and the hook that
 * feeds it stays a thin adapter.
 *
 * ── Method ────────────────────────────────────────────────────────────
 *
 * Returns are daily log returns over the dates every included name shares
 * (the intersection, so an HK name and a US name are compared on the days
 * both traded). Correlation is Pearson over that window. Clusters come from
 * average-linkage agglomerative clustering on distance 1 − ρ, merged while
 * the average correlation between two groups stays at or above the
 * threshold: with the default 0.6, two names are one bet when their daily
 * moves agree that strongly. The effective number of bets is the inverse
 * Herfindahl of cluster weights, 1 / Σ w², so a book of ten equal
 * independent clusters reads 10 and one dominated by a single cluster reads
 * near 1. Names with too little history stay in the book as their own bet
 * and are listed as excluded from the correlation, never dropped silently:
 * a book of eleven names is still eleven names' worth of money.
 */

export type ClosePoint = { time: string; close: number };

/** Daily log returns keyed by date, from a close series in any order. */
export function logReturns(points: ClosePoint[]): Map<string, number> {
  const sorted = points
    .filter((p) => p.time && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.time.localeCompare(b.time));
  const out = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time === sorted[i - 1].time) continue;
    out.set(sorted[i].time, Math.log(sorted[i].close / sorted[i - 1].close));
  }
  return out;
}

/** Dates every series has, ascending. */
export function commonDates(series: Map<string, number>[]): string[] {
  if (!series.length) return [];
  let dates = [...series[0].keys()];
  for (let i = 1; i < series.length; i++) {
    const s = series[i];
    dates = dates.filter((d) => s.has(d));
  }
  return dates.sort();
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return NaN;
  return sab / Math.sqrt(saa * sbb);
}

/** OLS slope of asset on market: the asset's beta. */
export function beta(asset: number[], market: number[]): number {
  const n = Math.min(asset.length, market.length);
  if (n < 2) return NaN;
  let ma = 0, mm = 0;
  for (let i = 0; i < n; i++) { ma += asset[i]; mm += market[i]; }
  ma /= n; mm /= n;
  let cov = 0, varm = 0;
  for (let i = 0; i < n; i++) {
    cov += (asset[i] - ma) * (market[i] - mm);
    varm += (market[i] - mm) ** 2;
  }
  if (varm === 0) return NaN;
  return cov / varm;
}

/** Symmetric n×n correlation matrix with a unit diagonal. */
export function correlationMatrix(columns: number[][]): number[][] {
  const n = columns.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = pearson(columns[i], columns[j]);
      m[i][j] = m[j][i] = Number.isFinite(r) ? r : 0;
    }
  }
  return m;
}

/**
 * Average-linkage agglomerative clustering on 1 − ρ. Returns groups of
 * indices; merging stops when no two groups average a correlation at or
 * above `threshold`. Order of the result is by first member index so it is
 * stable across renders.
 */
export function clusterByCorrelation(corr: number[][], threshold = 0.6): number[][] {
  const n = corr.length;
  let groups: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const avg = (a: number[], b: number[]) => {
    let s = 0;
    for (const i of a) for (const j of b) s += corr[i][j];
    return s / (a.length * b.length);
  };
  for (;;) {
    let best = -Infinity, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = avg(groups[i], groups[j]);
        if (a > best) { best = a; bi = i; bj = j; }
      }
    }
    if (bi < 0 || best < threshold) break;
    const merged = [...groups[bi], ...groups[bj]].sort((a, b) => a - b);
    groups = groups.filter((_, k) => k !== bi && k !== bj);
    groups.push(merged);
  }
  return groups.sort((a, b) => a[0] - b[0]);
}

/** Inverse Herfindahl: 1 / Σ w². Weights need not sum to one. */
export function effectiveBets(weights: number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const w of weights) { const f = Math.max(0, w) / total; h += f * f; }
  return h > 0 ? 1 / h : 0;
}

// ── The whole answer ───────────────────────────────────────────────────

export type PositionInput = {
  ticker: string;
  /** Market value in the book's reporting currency. */
  value: number;
  name?: string;
  sector?: string;
};

export type BookRiskInput = {
  positions: PositionInput[];
  /** Daily log returns per ticker (from `logReturns`). Missing = no history. */
  returns: Record<string, Map<string, number>>;
  /** Daily log returns of the market proxy (SPY). Optional. */
  market?: Map<string, number>;
  /** Six factor z-scores per ticker from the ranked book. Optional. */
  factors?: Record<string, Record<string, number>>;
  /** Fewest shared trading days a name needs to enter the correlation. */
  minObs?: number;
  /** Average correlation at which two groups become one bet. */
  threshold?: number;
};

export type Cluster = {
  id: number;
  members: string[];
  /** Fraction of book value, 0..1. */
  weight: number;
  /** Mean pairwise correlation inside the cluster; null for a singleton. */
  avgCorr: number | null;
  /** Value-weighted beta of the members; null without a market series. */
  beta: number | null;
};

export type BookRisk = {
  names: number;
  totalValue: number;
  /** Tickers in the correlation, in matrix order. */
  included: string[];
  /** Names kept as their own bet but outside the correlation, with why. */
  excluded: { ticker: string; reason: "no_history" | "short_history" }[];
  /** Shared window of the correlation. */
  window: { from: string | null; to: string | null; days: number };
  corr: number[][];
  weights: Record<string, number>;
  betas: Record<string, number>;
  bookBeta: number | null;
  clusters: Cluster[];
  effectiveBets: number;
  largest: Cluster | null;
  tilt: { factor: string; value: number }[];
  /** Fraction of book value the factor tilt covers. */
  tiltCoverage: number;
  threshold: number;
};

export function computeBookRisk(input: BookRiskInput): BookRisk {
  const minObs = input.minObs ?? 40;
  const threshold = input.threshold ?? 0.6;

  // One row per ticker; lots were consolidated upstream but be safe.
  const byTicker = new Map<string, PositionInput>();
  for (const p of input.positions) {
    const t = p.ticker.toUpperCase();
    const cur = byTicker.get(t);
    if (cur) cur.value += p.value;
    else byTicker.set(t, { ...p, ticker: t });
  }
  const positions = [...byTicker.values()].filter((p) => p.value > 0);
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const weights: Record<string, number> = {};
  for (const p of positions) weights[p.ticker] = totalValue > 0 ? p.value / totalValue : 0;

  // Who has history at all.
  const withHistory = positions.filter((p) => (input.returns[p.ticker]?.size ?? 0) > 0);
  const excluded: BookRisk["excluded"] = positions
    .filter((p) => !(input.returns[p.ticker]?.size ?? 0))
    .map((p) => ({ ticker: p.ticker, reason: "no_history" as const }));

  // The shared window. A single short-history name would shrink it for
  // everyone, so names are dropped one at a time, shortest first, until the
  // window clears the minimum. Those dropped are excluded as short_history.
  let candidates = [...withHistory].sort(
    (a, b) => input.returns[b.ticker].size - input.returns[a.ticker].size,
  );
  let dates: string[] = [];
  for (;;) {
    dates = commonDates(candidates.map((p) => input.returns[p.ticker]));
    if (candidates.length < 2 || dates.length >= minObs) break;
    const dropped = candidates.pop()!;
    excluded.push({ ticker: dropped.ticker, reason: "short_history" });
  }
  // A correlation needs two names on a long enough window; otherwise every
  // name is its own bet and the panel says why.
  if (candidates.length < 2 || dates.length < minObs) {
    for (const c of candidates) excluded.push({ ticker: c.ticker, reason: "short_history" });
    candidates = [];
    dates = [];
  }

  const included = candidates.map((p) => p.ticker);
  const columns = included.map((t) => dates.map((d) => input.returns[t].get(d)!));
  const corr = correlationMatrix(columns);

  // Betas on the same window (market dates intersected separately so a
  // missing SPY day does not shrink the correlation window).
  const betas: Record<string, number> = {};
  if (input.market) {
    for (const t of Object.keys(input.returns)) {
      if (!weights[t]) continue;
      const r = input.returns[t];
      const ds = [...r.keys()].filter((d) => input.market!.has(d)).sort();
      if (ds.length < minObs) continue;
      const b = beta(ds.map((d) => r.get(d)!), ds.map((d) => input.market!.get(d)!));
      if (Number.isFinite(b)) betas[t] = b;
    }
  }

  // Clusters: correlated groups, then every excluded name as its own bet.
  const groups = included.length ? clusterByCorrelation(corr, threshold) : [];
  const clusters: Cluster[] = groups.map((g, id) => {
    const members = g.map((i) => included[i]).sort((a, b) => weights[b] - weights[a]);
    let s = 0, n = 0;
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) { s += corr[g[a]][g[b]]; n++; }
    return { id, members, weight: members.reduce((w, t) => w + weights[t], 0), avgCorr: n ? s / n : null, beta: clusterBeta(members, weights, betas) };
  });
  for (const e of excluded) {
    clusters.push({ id: clusters.length, members: [e.ticker], weight: weights[e.ticker] ?? 0, avgCorr: null, beta: clusterBeta([e.ticker], weights, betas) });
  }
  clusters.sort((a, b) => b.weight - a.weight);
  clusters.forEach((c, i) => { c.id = i; });

  const bookBeta = (() => {
    let w = 0, s = 0;
    for (const [t, b] of Object.entries(betas)) { s += b * weights[t]; w += weights[t]; }
    return w > 0 ? s / w : null;
  })();

  // Factor tilt: value-weighted mean z-score over names the ranked book scores.
  const tilt: BookRisk["tilt"] = [];
  let tiltCoverage = 0;
  if (input.factors) {
    const sums = new Map<string, { s: number; w: number }>();
    for (const p of positions) {
      const f = input.factors[p.ticker];
      if (!f) continue;
      tiltCoverage += weights[p.ticker];
      for (const [k, v] of Object.entries(f)) {
        if (!Number.isFinite(v)) continue;
        const cur = sums.get(k) ?? { s: 0, w: 0 };
        cur.s += v * weights[p.ticker]; cur.w += weights[p.ticker];
        sums.set(k, cur);
      }
    }
    for (const [factor, { s, w }] of sums) if (w > 0) tilt.push({ factor, value: s / w });
  }

  return {
    names: positions.length,
    totalValue,
    included,
    excluded,
    window: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, days: dates.length },
    corr,
    weights,
    betas,
    bookBeta,
    clusters,
    effectiveBets: effectiveBets(clusters.map((c) => c.weight)),
    largest: clusters[0] ?? null,
    tilt,
    tiltCoverage,
    threshold,
  };
}

function clusterBeta(members: string[], weights: Record<string, number>, betas: Record<string, number>): number | null {
  let w = 0, s = 0;
  for (const t of members) if (betas[t] != null) { s += betas[t] * weights[t]; w += weights[t]; }
  return w > 0 ? s / w : null;
}
