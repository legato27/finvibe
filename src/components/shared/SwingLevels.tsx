"use client";

/**
 * Swing low / high (nearest weekly pivots straddling the last close — support
 * below, resistance above). The levels come from the PAM batch
 * (`pam_summary` → swing_low / swing_high); this module gives every list a
 * shared way to fetch them for a set of tickers and render them consistently.
 */
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";

interface PamRow {
  swing_low?: number | null;
  swing_high?: number | null;
}

export interface Swing {
  low: number | null;
  high: number | null;
}

/** Fetch swing low/high for a set of tickers (via the PAM batch), as a map. */
export function useSwingMap(tickers: string[]): Map<string, Swing> {
  const { data } = useQuery<Record<string, PamRow | null>>({
    queryKey: ["pam-swings", tickers.length],
    queryFn: () => stocksApi.pamBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 5 * 60_000,
  });
  return new Map(
    Object.entries(data ?? {}).map(([t, v]) => [
      t.toUpperCase(),
      { low: v?.swing_low ?? null, high: v?.swing_high ?? null },
    ]),
  );
}

const fmt = (x: number | null) =>
  x == null ? "—" : x.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Compact "low / high" cell — support (green) over/under resistance (red). */
export function SwingCell({ swing }: { swing?: Swing | null }) {
  if (!swing || (swing.low == null && swing.high == null)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="font-mono text-[11px] whitespace-nowrap" title="Nearest weekly swing low (support) / swing high (resistance)">
      <span className="text-signal-long">{fmt(swing.low)}</span>
      <span className="text-muted-foreground"> / </span>
      <span className="text-signal-short">{fmt(swing.high)}</span>
    </span>
  );
}
