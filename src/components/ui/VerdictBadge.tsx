"use client";

/**
 * VerdictBadge — THE one signal element, used everywhere a stock's verdict
 * appears (watchlist rows, screener rows, ranked rows, page heroes via
 * VerdictCard). Encodes the unified verdict state from the backend
 * verdict_engine.
 *
 * Accessibility contract (WCAG 2.1 AA):
 *  - never color-only: icon (aria-hidden) + always-visible text label
 *  - signal-token colors only (contrast-checked light+dark)
 *  - conflict is violet ⇄ — a different statement than neutral
 */
import { useTranslations } from "next-intl";

export type VerdictState =
  | "STRONG_LONG" | "LONG" | "NEUTRAL" | "SHORT" | "STRONG_SHORT" | "CONFLICTING";

export interface VerdictJson {
  state: VerdictState;
  score?: number;
  agreement?: number;
  confidence?: number;
  confidence_calibrated?: boolean;
  n_sources?: number;
  sources?: Record<string, SourceEvidence>;
  vetoes?: string[];
  conflict?: { between?: string[]; reason?: string; explanation?: string } | null;
  levels?: {
    sweet_spot?: { low?: number; high?: number } | null;
    invalidation?: number | null;
    target?: number | null;
    last_close?: number | null;
  };
  computed_at?: string;
}

export interface SourceEvidence {
  available: boolean;
  direction?: number;
  strength?: number;
  age_days?: number;
  [key: string]: unknown;
}

const STYLES: Record<VerdictState, { chip: string; arrow: string }> = {
  STRONG_LONG: {
    chip: "text-signal-long-strong bg-signal-long-bg border-signal-long/40",
    arrow: "M4 14l6-8 6 8H4zm0 6l6-8 6 8H4z", // double up
  },
  LONG: {
    chip: "text-signal-long bg-signal-long-bg border-signal-long/40",
    arrow: "M4 16l8-10 8 10H4z", // up
  },
  NEUTRAL: {
    chip: "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/40",
    arrow: "M4 11h16v2H4z", // dash
  },
  SHORT: {
    chip: "text-signal-short bg-signal-short-bg border-signal-short/40",
    arrow: "M4 8l8 10 8-10H4z", // down
  },
  STRONG_SHORT: {
    chip: "text-signal-short-strong bg-signal-short-bg border-signal-short/40",
    arrow: "M4 4l6 8 6-8H4zm0 6l6 8 6-8H4z", // double down
  },
  CONFLICTING: {
    chip: "text-signal-conflict bg-signal-conflict-bg border-signal-conflict/40",
    arrow: "M7 4l-4 4 4 4V9h6V7H7V4zm10 16l4-4-4-4v3h-6v2h6v3z", // opposing arrows
  },
};

const SIZES = {
  sm: { chip: "px-1.5 py-0.5 text-xs gap-1", icon: 12 },
  md: { chip: "px-2 py-1 text-sm gap-1.5", icon: 14 },
  lg: { chip: "px-3 py-1.5 text-base gap-2 font-semibold", icon: 18 },
} as const;

export default function VerdictBadge({
  state,
  size = "md",
  className = "",
}: {
  state: VerdictState | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = useTranslations("verdict");
  if (!state || !STYLES[state]) {
    return (
      <span className={`inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground ${className}`}>
        {t("none")}
      </span>
    );
  }
  const s = STYLES[state];
  const z = SIZES[size];
  return (
    <span
      className={`inline-flex items-center rounded border font-medium ${s.chip} ${z.chip} ${className}`}
    >
      <svg
        aria-hidden="true"
        width={z.icon}
        height={z.icon}
        viewBox="0 0 24 24"
        fill="currentColor"
        className="shrink-0"
      >
        <path d={s.arrow} />
      </svg>
      {t(`state.${state}`)}
    </span>
  );
}
