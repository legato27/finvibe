/**
 * The market heatmap's vocabulary: the row shape `GET /api/heatmap` returns,
 * the metrics a tile can be coloured by, and the pure helpers the treemap,
 * the table view and the tooltip all share — so a metric added here shows
 * up in every one of them with the same scale and the same formatting.
 *
 * Three scale kinds and no more:
 *   div  — diverging about a midpoint (day change, returns, z-scores): red
 *          below, the theme's neutral surface at the midpoint, green above.
 *   seq  — sequential magnitude (IV rank, conviction, F-score): one indigo
 *          ramp from the muted surface to the primary accent.
 *   cat  — status (verdict, PAM direction, options strategy): the app's own
 *          signal tokens, the same ones VerdictBadge uses.
 *
 * Colours are resolved from the CSS tokens at render time, so the treemap
 * follows the theme toggle without a second palette in code.
 */

export type VerdictState =
  | "STRONG_LONG" | "LONG" | "NEUTRAL" | "SHORT" | "STRONG_SHORT" | "CONFLICTING";

export interface HeatmapRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  sub_industry: string | null;
  indices: Array<"SPX" | "NDX">;
  weight: Partial<Record<"SPX" | "NDX", number>>;
  tier: "signals" | "market";
  market: {
    price: number | null;
    chg_1d: number | null;
    volume: number | null;
    rel_volume: number | null;
    ret_1w: number | null;
    ret_1m: number | null;
    ret_3m: number | null;
    ret_6m: number | null;
    ret_12m: number | null;
    ret_ytd: number | null;
    pct_from_52w_high: number | null;
    pct_above_52w_low: number | null;
    market_cap: number | null;
    cap_band: "mega" | "large" | "mid" | "small" | null;
    next_earnings: string | null;
  };
  signals?: {
    verdict: VerdictState | null;
    verdict_score: number | null;
    verdict_confidence: number | null;
    pam: {
      setup: string | null;
      direction: "long" | "short" | null;
      direction_label: string | null;
      status: string | null;
      conviction: number | null;
      monthly: string | null;
      weekly: string | null;
    } | null;
    ranked: {
      composite_z: number | null;
      percentile: number | null;
      bucket: "long" | "short" | "neutral" | null;
      rank: number | null;
    } | null;
    ensemble_3m_pct: number | null;
    prob_profit_pct: number | null;
    ensemble_signal: string | null;
    garch_vol: number | null;
    f_score: number | null;
    altman_z: number | null;
    altman_class: string | null;
    moat: "Wide" | "Narrow" | "None" | null;
    moat_confidence: number | null;
    intrinsic_value: number | null;
    margin_of_safety: number | null;
    range_10y: number | null;
    quarterly_trend: string | null;
    yearly_trend: string | null;
  };
  options?: {
    iv_rank: number | null;
    iv_percentile: number | null;
    atm_iv: number | null;
    expected_move_30d: number | null;
    pcr_oi: number | null;
    n_unusual_oi: number | null;
    chain_date: string | null;
    strategy: "sell_puts" | "sell_calls" | "sell_strangle" | null;
    conviction: number | null;
    pop: number | null;
    annualized_return_pct: number | null;
    best_dte: number | null;
  };
}

export interface HeatmapResponse {
  as_of: {
    market: string | null;
    returns: string | null;
    reference: string | null;
    membership: string | null;
    signals: string | null;
    options: string | null;
  };
  indices: Record<string, number>;
  count: number;
  tiers: { signals: number; market: number };
  sectors: string[];
  generated_at: string;
  cached: boolean;
  rows: HeatmapRow[];
}

export const VERDICTS: VerdictState[] = [
  "STRONG_LONG", "LONG", "NEUTRAL", "CONFLICTING", "SHORT", "STRONG_SHORT",
];

export const GICS_SECTORS = [
  "Information Technology", "Industrials", "Financials", "Health Care",
  "Consumer Discretionary", "Consumer Staples", "Utilities", "Real Estate",
  "Materials", "Communication Services", "Energy",
] as const;

export const STRATEGY_LABEL: Record<string, string> = {
  sell_puts: "Sell puts",
  sell_calls: "Sell calls",
  sell_strangle: "Sell strangle",
};

/** Signal-token names, resolved to colours by the treemap at render time. */
export type Tone = "long" | "long-strong" | "short" | "short-strong" | "neutral" | "conflict" | "caution";

export const VERDICT_TONE: Record<VerdictState, Tone> = {
  STRONG_LONG: "long-strong",
  LONG: "long",
  NEUTRAL: "neutral",
  CONFLICTING: "conflict",
  SHORT: "short",
  STRONG_SHORT: "short-strong",
};

const signed = (d: number) => (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
const signedPct = (d: number) => (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

export type Metric =
  | {
      key: string;
      label: string;
      short: string;
      kind: "div";
      lo: number;
      hi: number;
      mid?: number;
      value: (r: HeatmapRow) => number | null | undefined;
      fmt: (v: number) => string;
      tip: string;
    }
  | {
      key: string;
      label: string;
      short: string;
      kind: "seq";
      lo: number;
      hi: number;
      value: (r: HeatmapRow) => number | null | undefined;
      fmt: (v: number) => string;
      tip: string;
    }
  | {
      key: string;
      label: string;
      short: string;
      kind: "cat";
      cats: string[];
      tone: (v: string) => Tone;
      value: (r: HeatmapRow) => string | null | undefined;
      fmt: (v: string) => string;
      tip: string;
    };

/** Ordered as they appear in the Colour-by control. */
export const METRICS: Metric[] = [
  { key: "chg_1d", label: "Day change", short: "Day", kind: "div", lo: -3, hi: 3,
    value: (r) => r.market.chg_1d, fmt: signedPct(2),
    tip: "Change from the prior close, from Polygon's market snapshot. Live in session, last close otherwise." },
  { key: "ret_1w", label: "1-week return", short: "1W", kind: "div", lo: -8, hi: 8,
    value: (r) => r.market.ret_1w, fmt: signedPct(1), tip: "Close-to-close over the last 5 trading days." },
  { key: "ret_1m", label: "1-month return", short: "1M", kind: "div", lo: -15, hi: 15,
    value: (r) => r.market.ret_1m, fmt: signedPct(1), tip: "Close-to-close over the last 21 trading days." },
  { key: "ret_3m", label: "3-month return", short: "3M", kind: "div", lo: -25, hi: 25,
    value: (r) => r.market.ret_3m, fmt: signedPct(1), tip: "Close-to-close over the last 63 trading days." },
  { key: "ret_ytd", label: "Year-to-date return", short: "YTD", kind: "div", lo: -40, hi: 40,
    value: (r) => r.market.ret_ytd, fmt: signedPct(1), tip: "From the last close of the prior calendar year." },
  { key: "ret_12m", label: "12-month return", short: "12M", kind: "div", lo: -50, hi: 50,
    value: (r) => r.market.ret_12m, fmt: signedPct(1), tip: "Close-to-close over the last 252 trading days." },
  { key: "pct_from_52w_high", label: "Distance from 52-week high", short: "vs 52w hi", kind: "div", lo: -40, hi: 0, mid: -15,
    value: (r) => r.market.pct_from_52w_high, fmt: signedPct(1),
    tip: "How far below its 52-week high the name trades. 0 is at the high." },
  { key: "rel_volume", label: "Relative volume", short: "Rel vol", kind: "div", lo: 0.5, hi: 2, mid: 1,
    value: (r) => r.market.rel_volume, fmt: (v) => `${v.toFixed(2)}×`,
    tip: "Session volume divided by the 20-day average. 1× is normal." },
  { key: "verdict", label: "Verdict", short: "Verdict", kind: "cat", cats: VERDICTS,
    tone: (v) => VERDICT_TONE[v as VerdictState] ?? "neutral",
    value: (r) => r.signals?.verdict, fmt: (v) => v.replace("_", " "),
    tip: "The unified verdict: ensemble, price action, ranking, sentiment and FinVibe Thoughts arbitrated into one conflict-aware state." },
  { key: "verdict_score", label: "Verdict score", short: "V score", kind: "div", lo: -0.6, hi: 0.6,
    value: (r) => r.signals?.verdict_score, fmt: signed(2),
    tip: "The verdict's signed strength, −1 to +1, before it is bucketed into a state." },
  { key: "composite_z", label: "Ranked-book conviction", short: "Rank z", kind: "div", lo: -2, hi: 2,
    value: (r) => r.signals?.ranked?.composite_z, fmt: signed(2),
    tip: "Cross-sectional composite z-score across momentum, forecast, quality, value, moat and low volatility." },
  { key: "ensemble_3m_pct", label: "Ensemble 3-month forecast", short: "Ens 3M", kind: "div", lo: -15, hi: 15,
    value: (r) => r.signals?.ensemble_3m_pct, fmt: signedPct(1), tip: "The ML ensemble's predicted 3-month return." },
  { key: "prob_profit_pct", label: "Probability of profit", short: "POP", kind: "seq", lo: 30, hi: 80,
    value: (r) => r.signals?.prob_profit_pct, fmt: (v) => `${v.toFixed(0)}%`,
    tip: "Ensemble probability the name is profitable over its 3-month horizon." },
  { key: "pam_direction", label: "Price-action direction", short: "PAM", kind: "cat", cats: ["long", "short"],
    tone: (v) => (v === "long" ? "long" : v === "short" ? "short" : "neutral"),
    value: (r) => r.signals?.pam?.direction, fmt: (v) => v,
    tip: "Direction of the current price-action setup, where there is one. Ranging names carry no direction." },
  { key: "pam_conviction", label: "Price-action conviction", short: "PAM conv", kind: "seq", lo: 0, hi: 100,
    value: (r) => r.signals?.pam?.conviction, fmt: (v) => v.toFixed(0),
    tip: "The price-action read's own 0–100 conviction." },
  { key: "iv_rank", label: "IV rank", short: "IVR", kind: "seq", lo: 0, hi: 100,
    value: (r) => r.options?.iv_rank, fmt: (v) => v.toFixed(0),
    tip: "Where today's implied volatility sits in the name's own one-year range. High = rich premium." },
  { key: "atm_iv", label: "ATM implied volatility", short: "IV", kind: "seq", lo: 15, hi: 80,
    value: (r) => r.options?.atm_iv, fmt: (v) => `${v.toFixed(0)}%`, tip: "30-day at-the-money implied volatility, annualised." },
  { key: "expected_move_30d", label: "Expected move (30d)", short: "Exp move", kind: "seq", lo: 2, hi: 20,
    value: (r) => r.options?.expected_move_30d, fmt: (v) => `±${v.toFixed(1)}%`,
    tip: "The option market's one-standard-deviation move over 30 days." },
  { key: "strategy", label: "Options strategy", short: "Strategy", kind: "cat", cats: ["sell_puts", "sell_calls", "sell_strangle"],
    tone: (v) => (v === "sell_puts" ? "long" : v === "sell_calls" ? "short" : "caution"),
    value: (r) => r.options?.strategy, fmt: (v) => STRATEGY_LABEL[v] ?? v,
    tip: "The premium-selling call from the options ranked book. Only names that clear the volatility gate carry one." },
  { key: "margin_of_safety", label: "Margin of safety", short: "MoS", kind: "div", lo: -0.5, hi: 0.5,
    value: (r) => r.signals?.margin_of_safety, fmt: (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`,
    tip: "DCF intrinsic value versus price. Positive = trading below intrinsic value." },
  { key: "f_score", label: "Piotroski F-score", short: "F", kind: "seq", lo: 0, hi: 9,
    value: (r) => r.signals?.f_score, fmt: (v) => v.toFixed(0), tip: "Nine-point fundamental-health checklist." },
  { key: "altman_z", label: "Altman Z", short: "Z", kind: "div", lo: 1.8, hi: 3, mid: 2.4,
    value: (r) => r.signals?.altman_z, fmt: (v) => v.toFixed(1),
    tip: "Bankruptcy-risk score. Below 1.8 is distress, above 3 is safe." },
  { key: "range_10y", label: "Position in 10-year range", short: "10y", kind: "seq", lo: 0, hi: 1,
    value: (r) => r.signals?.range_10y, fmt: (v) => `${(v * 100).toFixed(0)}%`,
    tip: "Where the price sits between its 10-year low (0%) and high (100%)." },
];

export const METRIC_BY_KEY: Record<string, Metric> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export type GroupKey = "sector" | "industry" | "verdict" | "pam" | "strategy" | "none";
export type SizeKey = "cap" | "equal" | "weight" | "expected_move";
export type Universe = "both" | "spx" | "ndx" | "book";

export const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: "sector", label: "Sector" },
  { key: "industry", label: "Sector › industry" },
  { key: "verdict", label: "Verdict" },
  { key: "pam", label: "Price-action read" },
  { key: "strategy", label: "Options strategy" },
  { key: "none", label: "Nothing (flat)" },
];

export const SIZES: Array<{ key: SizeKey; label: string }> = [
  { key: "cap", label: "Market cap" },
  { key: "equal", label: "Equal" },
  { key: "weight", label: "S&P 500 weight" },
  { key: "expected_move", label: "Expected move" },
];

export function groupOf(r: HeatmapRow, key: GroupKey): string {
  switch (key) {
    case "none": return "All";
    case "industry": return `${r.sector ?? "Unclassified"} › ${r.sub_industry ?? "Other"}`;
    case "verdict": return r.signals?.verdict ?? (r.tier === "signals" ? "No verdict" : "Not enriched");
    case "pam": return r.signals?.pam?.direction_label ?? (r.tier === "signals" ? "Ranging, no setup" : "Not enriched");
    case "strategy": {
      const s = r.options?.strategy;
      return s ? STRATEGY_LABEL[s] : r.tier === "signals" ? "No options call" : "Not enriched";
    }
    default: return r.sector ?? "Unclassified";
  }
}

export function sizeOf(r: HeatmapRow, key: SizeKey): number {
  switch (key) {
    case "equal": return 1;
    case "weight": return r.weight.SPX ?? 0;
    case "expected_move": return r.options?.expected_move_30d ?? 0;
    default: return r.market.market_cap ?? 0;
  }
}

export function inUniverse(r: HeatmapRow, u: Universe): boolean {
  switch (u) {
    case "spx": return r.indices.includes("SPX");
    case "ndx": return r.indices.includes("NDX");
    case "book": return r.tier === "signals";
    default: return r.indices.length > 0;
  }
}

export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - now.getTime()) / 86_400_000);
}

export function fmtCap(cap: number | null | undefined): string {
  if (!cap) return "—";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(0)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

export const CAP_BANDS: Array<{ key: string; label: string }> = [
  { key: "mega", label: "Mega ≥ $200B" },
  { key: "large", label: "Large $10–200B" },
  { key: "mid", label: "Mid $2–10B" },
  { key: "small", label: "Small < $2B" },
];
