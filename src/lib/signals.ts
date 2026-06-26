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
