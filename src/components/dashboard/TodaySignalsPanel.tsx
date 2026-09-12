"use client";

/**
 * TodaySignalsPanel — the watchlist-tracking digest: new PAM triggers,
 * verdict changes since the last refresh, and current conflicts to review.
 * This is the "what changed / what needs my eyes" surface of the dashboard.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { stocksApi } from "@/lib/api";
import VerdictBadge, { VerdictState } from "@/components/ui/VerdictBadge";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import { ArrowUpRight } from "lucide-react";

interface Digest {
  new_pam_triggers: Array<{
    ticker: string; setup: string; direction: string | null;
    conviction: number | null; gate_qualified: boolean | null;
    triggered_at: string; invalidation: number | null; target: number | null;
  }>;
  verdict_changes: Array<{ ticker: string; from: string; to: string; at: string }>;
  conflicts: Array<{ ticker: string; between: string[]; explanation: string | null }>;
}

export function TodaySignalsPanel() {
  const t = useTranslations("verdict");
  const td = useTranslations("dashboard");
  const { data, isLoading, isError } = useQuery<Digest>({
    queryKey: ["signals-today"],
    queryFn: () => stocksApi.signalsToday(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  const aside = (
    <Link href="/desk" className="inline-flex items-center gap-0.5 text-[11px] text-signal hover:underline">
      {td("openDesk")}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
  if (isLoading) return <PanelPending label={td("todaySignals")} text={td("loadingGeneric")} className="h-full" />;
  if (isError || !data) return <PanelUnavailable label={td("todaySignals")} reason={td("notAvailableReason")} aside={aside} className="h-full" />;
  const empty =
    !data.new_pam_triggers.length && !data.verdict_changes.length && !data.conflicts.length;

  return (
    <Panel label={td("todaySignals")} qualifier={td("todaySignalsQualifier")} aside={aside} className="h-full">
      {empty && <p className="text-sm text-muted-foreground">{td("todaySignalsEmpty")}</p>}

      {data.new_pam_triggers.length > 0 && (
        <div className="mb-3">
          <h3 className="stat-label mb-1.5">
            {td("newSetups")}
          </h3>
          <ul className="space-y-1">
            {data.new_pam_triggers.slice(0, 6).map((s) => (
              <li key={`${s.ticker}-${s.triggered_at}`} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/stock/${s.ticker}`} className="font-mono font-semibold text-signal hover:underline">
                  {s.ticker}
                </Link>
                <span className={s.direction === "long" ? "text-signal-long" : "text-signal-short"}>
                  {s.setup}
                </span>
                {s.gate_qualified === true && (
                  <span className="rounded border border-signal-long/40 bg-signal-long-bg px-1.5 py-0.5 text-xs text-signal-long">
                    {td("gateQualified")}
                  </span>
                )}
                {s.gate_qualified == null && (
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {td("gateMeasuring")}
                  </span>
                )}
                <span className="nums ml-auto font-mono text-xs text-muted-foreground">
                  {s.invalidation != null ? `inv ${s.invalidation}` : ""}
                  {s.target != null ? ` → ${s.target}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.verdict_changes.length > 0 && (
        <div className="mb-3">
          <h3 className="stat-label mb-1.5">
            {td("verdictChanges")}
          </h3>
          <ul className="space-y-1">
            {data.verdict_changes.slice(0, 6).map((c) => (
              <li key={`${c.ticker}-${c.at}`} className="flex items-center gap-2 text-sm">
                <Link href={`/stock/${c.ticker}`} className="font-mono font-semibold text-signal hover:underline">
                  {c.ticker}
                </Link>
                <VerdictBadge state={c.from as VerdictState} size="sm" />
                <span aria-hidden="true" className="text-muted-foreground">→</span>
                <span className="sr-only">{td("changedTo")}</span>
                <VerdictBadge state={c.to as VerdictState} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.conflicts.length > 0 && (
        <div>
          <h3 className="stat-label mb-1.5">
            {td("conflictsToReview")}
          </h3>
          <ul className="space-y-1">
            {data.conflicts.slice(0, 6).map((c) => (
              <li key={c.ticker} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/stock/${c.ticker}`} className="font-mono font-semibold text-signal hover:underline">
                  {c.ticker}
                </Link>
                <span className="text-signal-conflict">
                  {c.between.map((b) => t(`source.${b}`)).join(" ⇄ ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
