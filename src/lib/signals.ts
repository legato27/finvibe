/**
 * Centralized signal → color / threshold mapping.
 *
 * Two goals:
 *  1. One source of truth for how a concept (direction, moat, margin of
 *     safety, IV rank) maps to a color, so the same number/string can't render
 *     differently across screens.
 *  2. Always use the contrast-checked `signal-*` design tokens (correct in
 *     BOTH light and dark mode) rather than raw Tailwind colors like
 *     `text-green-400`, which are only tuned for dark mode.
 */

// ── Directional signals ────────────────────────────────────────────────────
export type Direction = "long" | "short" | "neutral";

/**
 * Normalize the app's many directional vocabularies into one enum.
 * Anything unrecognized (incl. null) is "neutral" — never silently bullish.
 */
export function normalizeDirection(raw: string | null | undefined): Direction {
  if (!raw) return "neutral";
  const v = raw.toLowerCase();
  if (["long", "bullish", "buy", "up"].includes(v)) return "long";
  if (["short", "bearish", "avoid", "sell", "down"].includes(v)) return "short";
  return "neutral";
}

/** Text color token for a direction. Neutral = slate (never amber/caution). */
export function directionTextClass(dir: Direction): string {
  return dir === "long"
    ? "text-signal-long"
    : dir === "short"
    ? "text-signal-short"
    : "text-signal-neutral";
}

/** Full badge classes (text + tinted bg + border color) for a direction. */
export function directionBadgeClass(dir: Direction): string {
  return dir === "long"
    ? "text-signal-long bg-signal-long-bg border-signal-long/40"
    : dir === "short"
    ? "text-signal-short bg-signal-short-bg border-signal-short/40"
    : "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/40";
}

/**
 * Sign of a numeric metric (margin of safety, return, z-score) → text color.
 * Exactly zero is neutral, not negative.
 */
export function signTextClass(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "text-signal-neutral";
  return n > 0 ? "text-signal-long" : n < 0 ? "text-signal-short" : "text-signal-neutral";
}

// ── Unified verdict (6-state) → action vocabularies ─────────────────────────
export type VerdictAction = "buy" | "hold" | "avoid";

/**
 * Map the arbitrated 6-state verdict to the 3-state buy/hold/avoid vocabulary
 * the hero pill, options strategy, and portfolio advice speak. This is the
 * single bridge between `VerdictJson.state` and `thoughts.verdict`.
 *
 * U1 — CONFLICTING maps to `avoid`, not `hold`.
 *
 * It was surfaced as an absence of a view. It is not: measured over n=811 it
 * returned −5.22% raw and **−6.82% excess of SPY**, which makes it the most
 * bearish state in the system — more negative than SHORT at −5.23%. Only 36.0%
 * of CONFLICTING names beat the market. Low agreement between the models
 * (0.240) is itself information, and reading it as "no opinion" threw that
 * information away at exactly the moment it was worth most.
 */
export function verdictToAction(state: string | null | undefined): VerdictAction {
  switch (state) {
    case "STRONG_LONG":
    case "LONG":
      return "buy";
    case "SHORT":
    case "STRONG_SHORT":
    case "CONFLICTING":
      return "avoid";
    default:
      return "hold"; // NEUTRAL, null, unknown
  }
}

/**
 * Conviction for the hero, derived from the STATE rather than the confidence
 * number alone.
 *
 * U2 — the hero gave plain LONG the same visual weight as STRONG_LONG while
 * the two carry completely different outcomes:
 *
 *     STRONG_LONG   n=646    +5.02% raw   +3.84% excess   57.4% beat SPY
 *     LONG          n=5,834  +0.07% raw   −1.45% excess   46.4% beat SPY
 *
 * Plain LONG is not a weaker buy — on excess return it is mildly negative, and
 * it is the single largest bucket in the book. So the non-strong directional
 * states are capped at "medium" and can never present as high conviction,
 * whatever the confidence scalar says. NEUTRAL is "low" because it is, by
 * construction, the absence of a call.
 *
 * `confidence` still lowers conviction; it can no longer raise it past the cap.
 */
export function verdictConviction(
  state: string | null | undefined,
  confidence: number | null | undefined,
): "high" | "medium" | "low" {
  const fromConfidence = confidenceToConviction(confidence);
  switch (state) {
    case "STRONG_LONG":
    case "STRONG_SHORT":
      return fromConfidence;
    case "LONG":
    case "SHORT":
    case "CONFLICTING":
      // Capped: never "high".
      return fromConfidence === "high" ? "medium" : fromConfidence;
    case "NEUTRAL":
      return "low";
    default:
      return fromConfidence;
  }
}

/** Directional bucket of a unified verdict state (for conflict checks). */
export function verdictDirection(state: string | null | undefined): Direction {
  if (state === "STRONG_LONG" || state === "LONG") return "long";
  if (state === "SHORT" || state === "STRONG_SHORT") return "short";
  return "neutral";
}

/** Verdict confidence (0–1) → conviction label shown next to the action. */
export function confidenceToConviction(c: number | null | undefined): "high" | "medium" | "low" {
  if (c == null) return "medium";
  return c >= 0.66 ? "high" : c >= 0.33 ? "medium" : "low";
}

// ── Moat (3-tier, per catalog: Wide / Narrow / None) ────────────────────────
export interface MoatStyle {
  /** None / null → caller should not render the badge at all. */
  show: boolean;
  /** Badge classes: text + tinted bg + border color (caller adds `border`). */
  badgeClass: string;
}

/**
 * Wide = durable advantage → long (green). Narrow = a real but lesser moat →
 * neutral (slate), NOT caution/amber — amber reads as a *warning* for what is
 * a positive attribute. None / null → hidden. Any other rating is treated as
 * Narrow-equivalent (shown neutral) rather than dropped.
 */
export function moatStyle(moat: string | null | undefined): MoatStyle {
  if (!moat || moat === "None") return { show: false, badgeClass: "" };
  if (moat === "Wide") {
    return { show: true, badgeClass: "bg-signal-long-bg text-signal-long border-signal-long/40" };
  }
  return { show: true, badgeClass: "bg-signal-neutral-bg text-signal-neutral border-signal-neutral/40" };
}

/** Text-only moat color (for the key-metrics card). Wide green, else slate. */
export function moatTextClass(moat: string | null | undefined): string {
  return moat === "Wide" ? "text-signal-long" : "text-signal-neutral";
}

// ── Threshold constants ─────────────────────────────────────────────────────
/**
 * Neutral deadbands differ by metric scale — kept as named constants so the
 * differences are explicit and intentional, not accidental magic numbers.
 */
export const NEUTRAL_BAND = {
  /** SentimentPanel composite score (−1..1). */
  sentimentScore: 0.05,
  /** VerdictCard per-source agree-mark (normalized direction). */
  verdictDirection: 0.15,
  /** ModelCards 3-month ensemble / forecaster return. */
  ensembleReturn: 0.03,
} as const;

/** IV-rank classification cutoffs — single source of truth for chain + screener. */
export const IV_RANK = { high: 70, elevated: 40 } as const;

/** IV-rank → StatChip tone. Null = no data (neutral), never bullish. */
export function ivRankTone(v: number | null | undefined): "caution" | "neutral" | "long" {
  if (v == null) return "neutral";
  if (v >= IV_RANK.high) return "caution";
  if (v >= IV_RANK.elevated) return "neutral";
  return "long";
}

/**
 * Fear & Greed value (0–100) → gauge hex color. High = greed = green.
 * Returns a raw hex (chart/gauge fill, not a Tailwind class).
 */
export function fngColor(v: number): string {
  if (v <= 25) return "#ef4444"; // extreme fear
  if (v <= 40) return "#f97316"; // fear
  if (v <= 60) return "#fbbf24"; // neutral
  if (v <= 75) return "#86efac"; // greed
  return "#22c55e"; // extreme greed
}
