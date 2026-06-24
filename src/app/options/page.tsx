"use client";

/**
 * Options screener — a THIN scan over the watchlist built on real chain data:
 * verdict, IV rank (+ history sparkline), ATM IV, expected move, put/call OI,
 * 25Δ skew, unusual-OI count. Every row links into the stock's Options chain
 * tab where the real strikes/greeks live.
 *
 * Replaces the old 600-line model-estimate "options book" presentation.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { optionsApi } from "@/lib/api";
import DataTable, { Column } from "@/components/ui/DataTable";
import GuideCard from "@/components/ui/GuideCard";
import Sparkline from "@/components/ui/Sparkline";
import VerdictBadge, { VerdictState } from "@/components/ui/VerdictBadge";
import { ScreenerTabs } from "@/components/shared/ScreenerTabs";
import { LastUpdated } from "@/components/common/LastUpdated";
import { WatchlistStar } from "@/components/shared/WatchlistStar";
import { WatchlistPicklist, watchlistTickerSet, ALL_WATCHLISTS } from "@/components/shared/WatchlistPicklist";
import type { FilterDef } from "@/components/shared/ColumnFilters";
import { useWatchlistGroups } from "@/lib/supabase/hooks";

interface ScreenerRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  last_price: number | null;
  verdict: string | null;
  verdict_confidence: number | null;
  atm_iv_pct: number | null;
  iv_rank: number | null;
  iv_percentile: number | null;
  iv_sparkline: number[];
  expected_move_30d_pct: number | null;
  pcr_oi: number | null;
  skew_25d_pp: number | null;
  n_unusual_oi: number | null;
  summary_date: string | null;
  reco: OptionReco | null;
}

interface OptionReco {
  strategy: "sell_puts" | "sell_calls" | "sell_strangle" | null;
  conviction: number | null; // 0–1
  score: number | null;
  rank: number | null;
  best_dte: number | null;
  side: "put" | "call" | null;
  strike: number | null;
  strikes: { put: number; call: number } | null;
  pop: number | null; // 0–1
  annualized_return_pct: number | null;
  agreement: "agree" | "mixed" | "conflict" | null;
}

function fmt(v: number | null | undefined, digits = 1, suffix = ""): string {
  return v == null ? "—" : `${v.toFixed(digits)}${suffix}`;
}

const STRATEGY_TONE: Record<string, string> = {
  sell_puts: "text-signal-long",
  sell_calls: "text-signal-short",
  sell_strangle: "text-signal-caution",
};

export default function OptionsScreenerPage() {
  const t = useTranslations("optionsChain");
  const ts = useTranslations("optionsScreener");
  const tg = useTranslations("optionsGuide");

  const { data, isLoading } = useQuery<{ count: number; rows: ScreenerRow[] }>({
    queryKey: ["options-screener"],
    queryFn: () => optionsApi.screener(),
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  const { data: watchlistGroups } = useWatchlistGroups();
  const [watchlist, setWatchlist] = useState<string>(ALL_WATCHLISTS);
  const wlSet = watchlistTickerSet(watchlistGroups, watchlist);
  const rows = (data?.rows ?? []).filter((r) => !wlSet || wlSet.has(r.ticker.toUpperCase()));

  // No top-level timestamp on this endpoint — use the newest per-row snapshot
  // date as the "last updated by job" stamp (ISO dates compare lexically).
  const screenerAsOf = (data?.rows ?? []).reduce<string | null>(
    (max, r) => (r.summary_date && (!max || r.summary_date > max) ? r.summary_date : max),
    null,
  );

  const strategyLabel = (s: string) =>
    s === "sell_puts" ? ts("strat.sell_puts")
      : s === "sell_calls" ? ts("strat.sell_calls")
      : s === "sell_strangle" ? ts("strat.sell_strangle")
      : s;

  const filters: FilterDef<ScreenerRow>[] = [
    { key: "ticker", label: ts("colTicker"), kind: "text", value: (r) => r.ticker },
    { key: "verdict", label: ts("colVerdict"), kind: "select", value: (r) => r.verdict ?? "" },
    { key: "sector", label: "Sector", kind: "select", value: (r) => r.sector ?? "" },
    { key: "strategy", label: ts("colStrategyLong"), kind: "select", value: (r) => r.reco?.strategy ?? "", optionLabel: strategyLabel },
    { key: "iv_rank", label: ts("colIvRankLong"), kind: "number", value: (r) => r.iv_rank },
    { key: "atm_iv", label: ts("colAtmIv"), kind: "number", value: (r) => r.atm_iv_pct },
    { key: "em", label: ts("colExpectedMove"), kind: "number", value: (r) => r.expected_move_30d_pct },
    { key: "pcr", label: ts("colPcr"), kind: "number", value: (r) => r.pcr_oi },
    { key: "skew", label: ts("colSkew"), kind: "number", value: (r) => r.skew_25d_pp },
    { key: "unusual", label: ts("colUnusualLong"), kind: "number", value: (r) => r.n_unusual_oi },
    { key: "pop", label: "POP %", kind: "number", value: (r) => (r.reco?.pop != null ? Math.round(r.reco.pop * 100) : null) },
    { key: "ann", label: "Annualized %", kind: "number", value: (r) => r.reco?.annualized_return_pct ?? null },
  ];

  const columns: Column<ScreenerRow>[] = [
    {
      key: "ticker",
      header: ts("colTicker"),
      sortable: true,
      sortValue: (r) => r.ticker,
      cell: (r) => (
        <span>
          <span className="font-mono font-bold">{r.ticker}</span>
          <span className="ml-2 hidden text-xs text-muted-foreground lg:inline">{r.name}</span>
        </span>
      ),
    },
    {
      // Star toggle lives outside the first cell — that one carries the
      // row-stretched link, and a button can't nest inside it.
      key: "watch",
      header: (
        <>
          <span aria-hidden="true">★</span>
          <span className="sr-only">Watchlist</span>
        </>
      ),
      cell: (r) => <WatchlistStar ticker={r.ticker} />,
    },
    {
      key: "verdict",
      header: ts("colVerdict"),
      sortable: true,
      sortValue: (r) => r.verdict ?? "",
      cell: (r) => <VerdictBadge state={r.verdict as VerdictState} size="sm" />,
    },
    {
      key: "strategy",
      header: ts("colStrategy"),
      ariaLabel: ts("colStrategyLong"),
      sortable: true,
      // Sort by conviction; names without a ranked-book reco sink to the bottom.
      sortValue: (r) => r.reco?.conviction ?? -1,
      cell: (r) => {
        const rc = r.reco;
        if (!rc?.strategy) return <span className="text-muted-foreground" title={ts("noReco")}>—</span>;
        const conv = rc.conviction != null ? Math.round(rc.conviction * 100) : null;
        return (
          <span className="inline-flex flex-col items-start leading-tight">
            <span className={`text-xs font-semibold ${STRATEGY_TONE[rc.strategy] ?? ""}`}>
              {ts(`strat.${rc.strategy}`)}
            </span>
            {conv != null && (
              <span className="nums text-[10px] text-muted-foreground">{ts("convShort", { pct: conv })}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "trade",
      header: ts("colTrade"),
      ariaLabel: ts("colTradeLong"),
      sortable: true,
      sortValue: (r) => r.reco?.annualized_return_pct ?? -1,
      align: "right",
      hideBelow: "lg",
      cell: (r) => {
        const rc = r.reco;
        if (!rc?.strategy) return <span className="text-muted-foreground">—</span>;
        const strikeTxt =
          rc.strategy === "sell_strangle" && rc.strikes
            ? `${rc.strikes.put}p/${rc.strikes.call}c`
            : rc.strike != null
            ? `$${rc.strike}${rc.side === "call" ? "c" : "p"}`
            : "—";
        return (
          <span className="nums font-mono text-xs text-foreground/80">
            {strikeTxt}
            {rc.best_dte != null && <span className="text-muted-foreground"> · {rc.best_dte}d</span>}
            {rc.pop != null && <span className="text-muted-foreground"> · {ts("popShort", { pct: Math.round(rc.pop * 100) })}</span>}
            {rc.annualized_return_pct != null && (
              <span className="text-signal-long"> · {ts("annShort", { pct: rc.annualized_return_pct.toFixed(0) })}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "iv_rank",
      header: ts("colIvRank"),
      ariaLabel: ts("colIvRankLong"),
      sortable: true,
      sortValue: (r) => r.iv_rank,
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <Sparkline values={r.iv_sparkline} width={48} height={16} className="text-muted-foreground" />
          <span
            className={`nums font-mono font-semibold ${
              (r.iv_rank ?? 0) >= 70 ? "text-signal-caution" : ""
            }`}
          >
            {fmt(r.iv_rank, 0)}
          </span>
        </span>
      ),
    },
    {
      key: "atm_iv",
      header: ts("colAtmIv"),
      sortable: true,
      sortValue: (r) => r.atm_iv_pct,
      align: "right",
      className: "nums font-mono",
      cell: (r) => fmt(r.atm_iv_pct, 1, "%"),
    },
    {
      key: "em",
      header: ts("colExpectedMove"),
      sortable: true,
      sortValue: (r) => r.expected_move_30d_pct,
      align: "right",
      className: "nums font-mono",
      hideBelow: "sm",
      cell: (r) => (r.expected_move_30d_pct != null ? `±${r.expected_move_30d_pct}%` : "—"),
    },
    {
      key: "pcr",
      header: ts("colPcr"),
      sortable: true,
      sortValue: (r) => r.pcr_oi,
      align: "right",
      className: "nums font-mono",
      hideBelow: "md",
      cell: (r) => fmt(r.pcr_oi, 2),
    },
    {
      key: "skew",
      header: ts("colSkew"),
      sortable: true,
      sortValue: (r) => r.skew_25d_pp,
      align: "right",
      className: "nums font-mono",
      hideBelow: "lg",
      cell: (r) => (r.skew_25d_pp != null ? `${r.skew_25d_pp > 0 ? "+" : ""}${r.skew_25d_pp}pp` : "—"),
    },
    {
      key: "unusual",
      header: ts("colUnusual"),
      ariaLabel: ts("colUnusualLong"),
      sortable: true,
      sortValue: (r) => r.n_unusual_oi,
      align: "right",
      hideBelow: "md",
      cell: (r) =>
        r.n_unusual_oi ? (
          <span className="inline-flex items-center gap-1 text-signal-caution">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-signal-caution" />
            <span className="nums font-mono">{r.n_unusual_oi}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <ScreenerTabs />
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">{ts("title")}</h1>
          <p className="text-sm text-muted-foreground">{ts("subtitle")}</p>
          <LastUpdated at={screenerAsOf} className="mt-1 inline-block" />
        </div>
        <WatchlistPicklist groups={watchlistGroups} value={watchlist} onChange={setWatchlist} />
      </header>

      <GuideCard
        title={tg("screenerTitle")}
        intro={tg("screenerIntro")}
        sections={[
          {
            title: tg("sellTitle"),
            tone: "long",
            steps: ["s1", "s2", "s3", "s4", "s5"].map((k) => tg(`sellSteps.${k}`)),
          },
          {
            title: tg("buyTitle"),
            tone: "short",
            steps: ["s1", "s2", "s3", "s4", "s5"].map((k) => tg(`buySteps.${k}`)),
          },
        ]}
        footnote={tg("screenerFootnote")}
      />

      {isLoading ? (
        <div className="card p-8 text-center text-sm text-muted-foreground" role="status">
          {t("loading")}
        </div>
      ) : (
        <DataTable
          caption={ts("tableCaption")}
          columns={columns}
          rows={rows}
          filters={filters}
          rowKey={(r) => r.ticker}
          rowHref={(r) => `/stock/${r.ticker}?tab=options`}
          defaultSort={{ key: "iv_rank", dir: "desc" }}
          emptyText={ts("empty")}
        />
      )}
      <p className="text-xs text-muted-foreground">{t("delayedNote")}</p>
    </div>
  );
}
