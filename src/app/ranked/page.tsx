"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { modelsApi, stocksApi } from "@/lib/api";
import { useWatchlistGroups } from "@/lib/supabase/hooks";
import VerdictBadge, { type VerdictJson } from "@/components/ui/VerdictBadge";
import LivePrice from "@/components/ui/LivePrice";
import GuideCard from "@/components/ui/GuideCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { InfoTip } from "@/components/shared/InfoTip";
import { LastUpdated } from "@/components/common/LastUpdated";
import { ScreenerTabs } from "@/components/shared/ScreenerTabs";
import { WatchlistStar } from "@/components/shared/WatchlistStar";
import { WatchlistPicklist, watchlistTickerSet, ALL_WATCHLISTS } from "@/components/shared/WatchlistPicklist";
import { type FilterDef } from "@/components/shared/ColumnFilters";

interface RankedRow {
  ticker: string;
  sector: string | null;
  composite_z: number;
  rank: number;
  percentile: number;
  bucket: "long" | "short" | "neutral";
  factors: Record<string, number>;
  factors_used: number;
  prob_profit_pct?: number | null;
  pam?: unknown | null;
}
interface RankedBook {
  as_of?: string;
  universe_size: number;
  factors: string[];
  method: string;
  excluded_insufficient_data?: { ticker: string }[];
  ranked: RankedRow[];
}

const BUCKET_STYLE: Record<string, string> = {
  long: "text-signal-long",
  short: "text-signal-short",
  neutral: "text-muted-foreground",
};
const TIPS = {
  prob:
    "Ensemble model's probability that the name is profitable over its 3-month horizon. Sort by this for highest-probability names on top.",
  composite:
    "Cross-sectional composite z-score equal-weighting momentum, forecast, quality, value (margin of safety), moat and low-volatility vs the whole universe. Higher = stronger relative rank.",
  percentile:
    "Rank percentile (0–100) within the universe — 100 = top-ranked composite-z conviction.",
  signal: "Where the six-factor quant model alone ranks this name: Strong = top quintile, Weak = bottom quintile, Mid = middle. This is purely the factor ranking — distinct from the Verdict (the arbitrated final call), which can differ (e.g. when sentiment or the ensemble outweighs a weak factor rank).",
  verdict: "The unified verdict — ensemble, price action, ranking, sentiment and FinVibe Thoughts arbitrated into one conflict-aware state.",
  price: "Live price, refreshed every 60s.",
};

function bucketIcon(b: string) {
  if (b === "long") return <TrendingUp className="w-3.5 h-3.5" />;
  if (b === "short") return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}
const usd = (x?: number | null) =>
  x == null ? "—" : `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RankedBookPage() {
  const [watchlist, setWatchlist] = useState<string>(ALL_WATCHLISTS);

  const { data, isLoading, error } = useQuery<RankedBook>({
    queryKey: ["cross-sectional-ranked"],
    queryFn: () => modelsApi.crossSectional(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: watchlistGroups } = useWatchlistGroups();
  const wlSet = watchlistTickerSet(watchlistGroups, watchlist);

  // Live prices (the ranking is cached; overlay realtime quotes for all names).
  const tickers = data?.ranked.map((r) => r.ticker) ?? [];
  const { data: livePrices } = useQuery<Array<{ ticker: string; price: number | null }>>({
    queryKey: ["ranked-live-prices", tickers.length],
    queryFn: () => stocksApi.refreshPrices(tickers),
    enabled: tickers.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const priceMap = new Map((livePrices ?? []).map((p) => [p.ticker, p.price]));

  // Unified verdict per name (replaces the standalone PAM badge column).
  const { data: verdictMap } = useQuery<Record<string, VerdictJson | null>>({
    queryKey: ["ranked-verdicts", tickers.length],
    queryFn: () => stocksApi.verdictBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 5 * 60_000,
  });

  // Honesty stat: realized forward returns by bucket (fills as snapshots mature).
  const { data: perf } = useQuery<{
    tracking_since: string | null;
    buckets: Record<string, { n_resolved: number; avg_fwd_5d_pct: number | null; avg_fwd_21d_pct: number | null }>;
  }>({
    queryKey: ["ranked-performance"],
    queryFn: () => modelsApi.rankedBookPerformance(),
    staleTime: 60 * 60_000,
    retry: 1,
  });

  // Watchlist scope; DataTable owns column filtering + sort (click a header).
  const wlRows = (data?.ranked ?? []).filter(
    (r) => !wlSet || wlSet.has(r.ticker.toUpperCase()),
  );
  const bucketLabel = (b: string) => (b === "long" ? "Strong" : b === "short" ? "Weak" : "Mid");
  const filterDefs: FilterDef<RankedRow>[] = [
    { key: "ticker", label: "Ticker", kind: "text", value: (r) => r.ticker },
    { key: "bucket", label: "Factor rank", kind: "select", value: (r) => r.bucket, optionLabel: bucketLabel },
    { key: "sector", label: "Sector", kind: "select", value: (r) => r.sector ?? "" },
    { key: "verdict", label: "Verdict", kind: "select", value: (r) => verdictMap?.[r.ticker]?.state ?? "" },
    { key: "prob", label: "Prob %", kind: "number", value: (r) => r.prob_profit_pct ?? null },
    { key: "composite_z", label: "Conviction", kind: "number", value: (r) => r.composite_z },
    { key: "percentile", label: "Percentile", kind: "number", value: (r) => r.percentile },
  ];

  const columns: Column<RankedRow>[] = [
    {
      key: "ticker",
      header: "Ticker",
      cell: (r) => (
        <span className="font-mono">
          <span className="text-muted-foreground mr-1.5">{r.rank}</span>
          <span className="font-semibold text-primary">{r.ticker}</span>
        </span>
      ),
    },
    {
      key: "watch",
      header: <span className="sr-only">Watchlist</span>,
      ariaLabel: "Watchlist",
      cell: (r) => <WatchlistStar ticker={r.ticker} />,
    },
    {
      key: "verdict",
      header: "Verdict",
      ariaLabel: "Verdict",
      sortable: true,
      sortValue: (r) => verdictMap?.[r.ticker]?.state ?? "",
      cell: (r) => <VerdictBadge state={verdictMap?.[r.ticker]?.state} size="sm" />,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortable: true,
      sortValue: (r) => priceMap.get(r.ticker) ?? null,
      cell: (r) => {
        const live = priceMap.get(r.ticker) ?? null;
        return <LivePrice price={live} currency="$" live={live != null} className="text-xs" />;
      },
    },
    {
      key: "prob",
      header: "Prob. profit",
      align: "right",
      sortable: true,
      sortValue: (r) => r.prob_profit_pct ?? -1,
      cell: (r) => (
        <span className={`font-mono ${r.prob_profit_pct == null ? "text-muted-foreground" : r.prob_profit_pct >= 50 ? "text-signal-long" : "text-signal-short"}`}>
          {r.prob_profit_pct == null ? "—" : `${r.prob_profit_pct.toFixed(0)}%`}
        </span>
      ),
    },
    {
      key: "sector",
      header: "Sector",
      optional: true,
      sortable: true,
      sortValue: (r) => r.sector ?? "",
      cell: (r) => <span className="text-muted-foreground">{r.sector ?? "—"}</span>,
    },
    {
      key: "composite_z",
      header: "Conviction",
      align: "right",
      sortable: true,
      sortValue: (r) => r.composite_z,
      cell: (r) => (
        <span className={`font-mono ${r.composite_z >= 0 ? "text-signal-long" : "text-signal-short"}`}>
          {r.composite_z >= 0 ? "+" : ""}{r.composite_z.toFixed(2)}
        </span>
      ),
    },
    {
      key: "percentile",
      header: "Percentile",
      align: "right",
      optional: true,
      sortable: true,
      sortValue: (r) => r.percentile,
      cell: (r) => <span className="font-mono text-muted-foreground">{r.percentile.toFixed(0)}</span>,
    },
    {
      key: "bucket",
      header: "Factor rank",
      ariaLabel: "Factor rank",
      sortable: true,
      sortValue: (r) => r.composite_z,
      cell: (r) => (
        <span className={`inline-flex items-center gap-1 ${BUCKET_STYLE[r.bucket]}`}>
          {bucketIcon(r.bucket)}
          {bucketLabel(r.bucket)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <ScreenerTabs />
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold">Ranked Book</h1>
          <LastUpdated at={data?.as_of} />
        </div>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
          Your watchlist names scored against each other on six factors and ranked best → worst.{" "}
          <span className="text-foreground/80">How to read it:</span> the <strong className="text-foreground/80">Verdict</strong> is
          the system&rsquo;s final call; <strong className="text-foreground/80">Factor rank</strong> is where the quant
          model alone places the name (they can differ). Sort by probability of profit or conviction.
        </p>
      </div>

      <GuideCard
        title="How the Ranked Book works"
        intro="Every US watchlist stock is scored against every other stock on six factors, blended into one composite z-score. The top quintile is the Long bucket, the bottom quintile is Short. Highest-conviction names rank first."
        sections={[
          {
            title: "The six factors",
            tone: "plain",
            steps: [
              "Momentum — 12-1 month price trend (last year's return, skipping the most recent month).",
              "Forecast — the ML ensemble's predicted 3-month return.",
              "Quality — Piotroski F-score, a 9-point fundamental-health checklist.",
              "Value — DCF margin of safety (intrinsic value vs price).",
              "Moat — confidence in the company's competitive moat.",
              "Low volatility — GARCH volatility forecast, scored inverted (calmer = better).",
            ],
          },
          {
            title: "How the score is built",
            tone: "plain",
            steps: [
              "Each factor becomes a cross-sectional z-score: how many standard deviations a name sits above/below the universe average, capped at ±3 so outliers can't dominate.",
              "The composite is the equal-weighted average of a name's available z-scores (a stock needs at least 3 of the 6 factors to be ranked).",
              "Sorted by composite: top 20% = Long, bottom 20% = Short, the middle 60% = Neutral.",
              "The Verdict column is separate — it arbitrates the rank with price action, sentiment, the ensemble and FinVibe Thoughts, and is NOT changed by your weights.",
            ],
          },
        ]}
        footnote="Recomputed nightly after the quant refresh. US-listed names only. The Verdict column is the system's arbitrated call and is computed separately from this rank."
      />

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">Computing cross-sectional ranking…</div>}
      {error && <div className="card p-6 text-sm text-danger">Failed to load ranking.</div>}

      {data && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{data.universe_size} names</span>
            <span className="flex items-center gap-1 text-signal-long">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-signal-long animate-pulse" />
              live prices · 60s
            </span>
            <span>·</span>
            <span>factors: {data.factors.join(", ")}</span>
          </div>

          {/* watchlist scope */}
          <div className="flex flex-wrap items-center gap-3">
            <WatchlistPicklist groups={watchlistGroups} value={watchlist} onChange={setWatchlist} />
            <span className="text-[11px] text-muted-foreground">Click a column header to sort · use the filters to narrow.</span>
          </div>

          {/* legend (kept above the table — InfoTip cards would be clipped inside the scroll container) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground bg-muted/30 border border-border/30 rounded-lg px-3 py-2">
            <span className="text-foreground/70 font-medium">What the columns mean:</span>
            <InfoTip label="Verdict" tip={TIPS.verdict} size={11} />
            <InfoTip label="Price" tip={TIPS.price} size={11} />
            <InfoTip label="Prob. profit" tip={TIPS.prob} size={11} />
            <InfoTip label="Conviction" tip={TIPS.composite} size={11} />
            <InfoTip label="Percentile" tip={TIPS.percentile} size={11} />
            <InfoTip label="Factor rank" tip={TIPS.signal} size={11} />
          </div>

          <DataTable
            caption="Ranked Book — watchlist names scored on six factors"
            columns={columns}
            rows={wlRows}
            rowKey={(r) => r.ticker}
            rowHref={(r) => `/stock/${r.ticker}`}
            filters={filterDefs}
            defaultSort={{ key: "prob", dir: "desc" }}
            emptyText={
              wlSet
                ? "No names match — your watchlist names may be excluded for sparse data; try All names."
                : "No names match."
            }
          />

          {perf?.tracking_since && (
            <div className="card px-4 py-3 text-xs">
              <span className="font-semibold text-foreground/80 mr-2">Realized bucket returns</span>
              {Object.keys(perf.buckets).length === 0 ? (
                <span className="text-muted-foreground">
                  tracking since {perf.tracking_since} — first 21-day returns resolve in ~4 weeks.
                </span>
              ) : (
                <span className="space-x-3">
                  {(["long", "neutral", "short"] as const).map((b) => {
                    const s = perf.buckets[b];
                    if (!s) return null;
                    return (
                      <span key={b} className="nums font-mono">
                        <span className="capitalize text-muted-foreground">{b}</span>{" "}
                        21d {s.avg_fwd_21d_pct != null ? `${s.avg_fwd_21d_pct > 0 ? "+" : ""}${s.avg_fwd_21d_pct}%` : "—"}{" "}
                        <span className="text-muted-foreground">(n={s.n_resolved})</span>
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{data.method}</p>
        </>
      )}
    </div>
  );
}
