"use client";

/**
 * Whether the safety net is actually loaded.
 *
 * The staging tier only ever reveals itself during an outage, which is the
 * worst moment to discover it is empty — and the captured half starts empty
 * by construction, filling as the app is used. This card is the answer to
 * "would anything still render if the box went dark right now", asked at a
 * time when it can still be acted on.
 *
 * It reads /api/staging/coverage, which is a LOCAL route backed by Supabase
 * alone. That is the point: the existing job-runs card next to it goes blank
 * during exactly the failure this one exists to describe.
 */

import { useQuery } from "@tanstack/react-query";
import { Database, AlertTriangle, RefreshCw } from "lucide-react";

type Family = {
  key: string;
  label: string;
  kind: "pushed" | "captured";
  rows: number;
  fresh: number;
  newest: string | null;
  oldest: string | null;
  windowDays: number;
};

type Coverage = {
  families?: Family[];
  catalog?: { rows: number; fresh: number; windowDays: number };
  checked_at?: string;
  error?: string;
};

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StagingCoverageCard() {
  const { data, isLoading, refetch, isFetching } = useQuery<Coverage>({
    queryKey: ["staging-coverage"],
    queryFn: () => fetch("/api/staging/coverage").then((r) => r.json()),
    staleTime: 60_000,
  });

  const families = data?.families ?? [];
  const captured = families.filter((f) => f.kind === "captured");
  const capturedRows = captured.reduce((n, f) => n + f.rows, 0);

  return (
    <div className="card p-0">
      <div className="card-header border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <div>
            <span className="card-title">Outage coverage</span>
            <div className="text-xs text-muted-foreground mt-0.5">
              What Supabase could still serve if the analysis backend went dark.
            </div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh coverage"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {data?.error && (
        <div className="px-4 py-3 flex items-start gap-2 text-xs text-signal-caution border-b border-border/40">
          <AlertTriangle className="w-4 h-4 flex-none mt-px" />
          <span>{data.error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Checking…</div>
      ) : (
        <>
          {/* The captured half is the one that starts empty and fills with
              use, so it gets said in words rather than left to be inferred
              from a row of zeroes. */}
          {!data?.error && capturedRows === 0 && (
            <div className="px-4 py-3 flex items-start gap-2 text-xs text-signal-caution border-b border-border/40">
              <AlertTriangle className="w-4 h-4 flex-none mt-px" />
              <span>
                Nothing captured yet. The captured families fill as the app is
                used — open the dashboard, the ranked book and a few stock
                pages, then check again.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left font-medium px-4 py-2">Family</th>
                  <th className="text-right font-medium px-3 py-2">Servable</th>
                  <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">Stored</th>
                  <th className="text-right font-medium px-3 py-2 hidden md:table-cell">Newest</th>
                  <th className="text-right font-medium px-4 py-2 hidden lg:table-cell">Window</th>
                </tr>
              </thead>
              <tbody>
                {families.map((f) => (
                  <tr key={f.key} className="border-b border-border/20 last:border-0">
                    <td className="px-4 py-2">
                      <span className="text-foreground">{f.label}</span>
                      <span className="ml-2 text-[9px] font-mono uppercase text-muted-foreground/70">
                        {f.kind}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        f.fresh > 0 ? "text-signal-long" : "text-muted-foreground"
                      }`}
                      title="Rows still inside their serving window — the ones that would actually answer"
                    >
                      {f.fresh.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground hidden sm:table-cell">
                      {f.rows.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground hidden md:table-cell">
                      {fmtTime(f.newest)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground font-mono hidden lg:table-cell">
                      {f.windowDays}d
                    </td>
                  </tr>
                ))}
                {data?.catalog && (
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2">
                      <span className="text-foreground">prices</span>
                      <span className="ml-2 text-[9px] font-mono uppercase text-muted-foreground/70">
                        catalog mirror
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        data.catalog.fresh > 0 ? "text-signal-long" : "text-muted-foreground"
                      }`}
                    >
                      {data.catalog.fresh.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground hidden sm:table-cell">
                      {data.catalog.rows.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground hidden md:table-cell">
                      —
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground font-mono hidden lg:table-cell">
                      {data.catalog.windowDays}d
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-t border-border/40">
            <span className="font-medium text-foreground/80">Servable</span> counts
            rows inside their serving window. Past it the fallback declines and
            the caller gets the real failure — a stale option chain read as
            live is a wrong trade, not a stale number.
          </div>
        </>
      )}
    </div>
  );
}
