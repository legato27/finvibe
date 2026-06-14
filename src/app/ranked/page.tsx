"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { modelsApi, stocksApi } from "@/lib/api";
import { useMyWatchlistTickers } from "@/lib/supabase/hooks";
import VerdictBadge, { type VerdictJson } from "@/components/ui/VerdictBadge";
import LivePrice from "@/components/ui/LivePrice";
import GuideCard from "@/components/ui/GuideCard";
import { InfoTip } from "@/components/shared/InfoTip";
import { ScopeSortControls } from "@/components/shared/ScopeSortControls";
import { ScreenerTabs } from "@/components/shared/ScreenerTabs";
import { WatchlistStar } from "@/components/shared/WatchlistStar";

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
// Six ranking factors (keys mirror the backend cross_sectional engine). The
// composite is a weighted average of a name's available factor z-scores; weights
// are applied client-side so the table re-ranks instantly without a recompute.
const FACTOR_META: { key: string; label: string; desc: string }[] = [
  { key: "momentum", label: "Momentum", desc: "12-1 month price trend (last year's return, skipping the latest month)" },
  { key: "ensemble", label: "Forecast", desc: "ML ensemble predicted 3-month return" },
  { key: "quality", label: "Quality", desc: "Piotroski F-score — 9-point fundamental-health checklist" },
  { key: "value", label: "Value", desc: "DCF margin of safety (intrinsic value vs price)" },
  { key: "moat", label: "Moat", desc: "Confidence in the company's competitive moat" },
  { key: "low_vol", label: "Low vol", desc: "GARCH volatility forecast, scored inverted (calmer = better)" },
];
const FACTOR_KEYS = FACTOR_META.map((f) => f.key);
// Equal default weights reproduce the engine's equal-weighted composite.
const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(FACTOR_KEYS.map((k) => [k, 50]));
const WEIGHTS_KEY = "vibefin-ranked-weights";

const TIPS = {
  prob:
    "Ensemble model's probability that the name is profitable over its 3-month horizon. Sort by this for highest-probability names on top.",
  composite:
    "Cross-sectional composite z-score blending the six factors (by your weights) vs the whole universe. Higher = stronger relative rank.",
  percentile:
    "Rank percentile (0–100) within the universe — 100 = top-ranked composite-z conviction.",
  signal: "Top quintile → Long, bottom quintile → Short, middle → Neutral.",
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
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [sort, setSort] = useState<"prob" | "z">("prob");
  const [symbol, setSymbol] = useState("");
  const [weightsOpen, setWeightsOpen] = useState(false);

  // Factor weights — personal lens, persisted to localStorage. Equal defaults
  // reproduce the backend's equal-weighted composite.
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return DEFAULT_WEIGHTS;
    try {
      const raw = window.localStorage.getItem(WEIGHTS_KEY);
      if (raw) return { ...DEFAULT_WEIGHTS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return DEFAULT_WEIGHTS;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
    } catch {
      // ignore — weights just won't persist
    }
  }, [weights]);
  const isDefaultWeights = FACTOR_KEYS.every((k) => weights[k] === DEFAULT_WEIGHTS[k]);

  const { data, isLoading, error } = useQuery<RankedBook>({
    queryKey: ["cross-sectional-ranked"],
    queryFn: () => modelsApi.crossSectional(),
    staleTime: 5 * 60 * 1000,
  });

  // Re-weight client-side: recompute composite (weighted mean of available
  // factor z-scores), then re-sort / re-rank / re-percentile / re-bucket. Equal
  // weights == the backend result; zeroing a factor drops it from the blend.
  const rankedRows = useMemo(() => {
    const rows = data?.ranked ?? [];
    if (!rows.length) return [] as RankedRow[];
    const scored = rows.map((r) => {
      let num = 0;
      let den = 0;
      for (const k of FACTOR_KEYS) {
        const z = r.factors?.[k];
        const w = weights[k] ?? 0;
        if (typeof z === "number" && w > 0) {
          num += w * z;
          den += w;
        }
      }
      const composite = den > 0 ? num / den : r.composite_z;
      return { ...r, composite_z: Math.round(composite * 1000) / 1000 };
    });
    scored.sort((a, b) => b.composite_z - a.composite_z);
    const n = scored.length;
    scored.forEach((r, i) => {
      r.rank = i + 1;
      r.percentile = Math.round(((n - i) / n) * 1000) / 10;
      r.bucket = i < n * 0.2 ? "long" : i >= n * 0.8 ? "short" : "neutral";
    });
    return scored;
  }, [data, weights]);

  const { data: myTickers } = useMyWatchlistTickers();
  const hasMine = (myTickers?.size ?? 0) > 0;
  const useMine = scope === "mine" && hasMine;

  // Live prices (the ranking is cached; overlay realtime quotes for all names).
  const tickers = rankedRows.map((r) => r.ticker);
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

  // Backend rank (the `rank` column) reflects composite-z; display order follows
  // the chosen sort — prob-of-profit (default) or composite-z conviction.
  const sortKey = (r: RankedRow) =>
    sort === "prob" ? r.prob_profit_pct ?? -1 : r.composite_z;
  const q = symbol.trim().toUpperCase();
  const visibleRows = rankedRows
    .filter((r) => filter === "all" || r.bucket === filter)
    .filter((r) => !useMine || (myTickers?.has(r.ticker) ?? false))
    .filter((r) => !q || r.ticker.toUpperCase().includes(q))
    .slice()
    .sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <ScreenerTabs />
      <div>
        <h1 className="text-lg font-semibold">Ranked Book</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Cross-sectional composite z-score across the watchlist universe — ranked by conviction (top quintile = long,
          bottom = short). Highest-conviction names first.
        </p>
      </div>

      <GuideCard
        title="How the Ranked Book works"
        intro="Every watchlist stock is scored against every other stock on six factors, blended into one composite z-score. The top quintile is the Long bucket, the bottom quintile is Short. Use the factor weights below to tilt the blend toward what you care about."
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
              "The composite is the weighted average of a name's available z-scores (a stock needs at least 3 of the 6 factors to be ranked).",
              "Sorted by composite: top 20% = Long, bottom 20% = Short, the middle 60% = Neutral.",
              "The Verdict column is separate — it arbitrates the rank with price action, sentiment, the ensemble and FinVibe Thoughts, and is NOT changed by your weights.",
            ],
          },
        ]}
        footnote="Recomputed nightly after the quant refresh. Factor weights are applied in your browser and re-rank the table instantly — they personalise your view without changing the underlying data or the system Verdict."
      />

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">Computing cross-sectional ranking…</div>}
      {error && <div className="card p-6 text-sm text-red-400">Failed to load ranking.</div>}

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

          {/* Factor weights — personal lens, re-ranks the book client-side */}
          <section aria-label="Factor weights" className="card">
            <button
              type="button"
              aria-expanded={weightsOpen}
              onClick={() => setWeightsOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
                <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                Factor weights
                {!isDefaultWeights && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-normal text-primary">customised</span>
                )}
              </span>
              {weightsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </button>

            {weightsOpen && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Tilt how much each factor counts toward the composite. Re-ranks the table instantly (your view only — the
                  system Verdict is unchanged). Set a factor to 0 to ignore it.
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  {FACTOR_META.map((f) => (
                    <div key={f.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground/80" title={f.desc}>
                          {f.label}
                        </span>
                        <span className="font-mono text-muted-foreground">{weights[f.key]}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={weights[f.key]}
                        onChange={(e) => setWeights((w) => ({ ...w, [f.key]: Number(e.target.value) }))}
                        className="w-full accent-primary"
                        aria-label={`${f.label} weight`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setWeights(DEFAULT_WEIGHTS)}
                    disabled={isDefaultWeights}
                    className="rounded-md border border-border/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* scope + sort */}
          <ScopeSortControls
            scope={scope}
            onScope={setScope}
            hasMine={hasMine}
            mineCount={myTickers?.size}
            sort={sort}
            sortOptions={[
              { value: "prob", label: "Prob of profit" },
              { value: "z", label: "Conviction (z)" },
            ]}
            onSort={(s) => setSort(s as "prob" | "z")}
          />

          {/* long / short / all + symbol filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
              {(["all", "long", "short"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                    filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground/80"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Filter symbol…"
              className="px-3 py-1.5 rounded-md text-xs bg-muted/50 border border-border/30 focus:outline-none focus:ring-1 focus:ring-primary/50 w-40"
            />
          </div>

          {/* legend (kept above the table — InfoTip cards would be clipped inside the scroll container) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground bg-muted/30 border border-border/30 rounded-lg px-3 py-2">
            <span className="text-foreground/70 font-medium">Legend:</span>
            <InfoTip label="Price" tip={TIPS.price} size={11} />
            <InfoTip label="Prob" tip={TIPS.prob} size={11} />
            <InfoTip label="Composite z" tip={TIPS.composite} size={11} />
            <InfoTip label="%ile" tip={TIPS.percentile} size={11} />
            <InfoTip label="Signal" tip={TIPS.signal} size={11} />
            <InfoTip label="Verdict" tip={TIPS.verdict} size={11} />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                  <th scope="col" className="text-left p-2">#</th>
                  <th scope="col" className="text-left p-2">Ticker</th>
                  <th scope="col" className="text-right p-2" title={TIPS.price}>Price</th>
                  <th scope="col" className="text-right p-2" title={TIPS.prob}>Prob</th>
                  <th scope="col" className="text-left p-2 hidden sm:table-cell">Sector</th>
                  <th scope="col" className="text-right p-2" title={TIPS.composite}>Composite z</th>
                  <th scope="col" className="text-right p-2 hidden md:table-cell" title={TIPS.percentile}>%ile</th>
                  <th scope="col" className="text-center p-2" title={TIPS.signal}>Signal</th>
                  <th scope="col" className="text-center p-2" title={TIPS.verdict}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      No names match.{" "}
                      {useMine && "Your watchlist names may be excluded for sparse data — try “All”."}
                    </td>
                  </tr>
                )}
                {visibleRows.map((r) => {
                  const live = priceMap.get(r.ticker) ?? null;
                  return (
                    <tr key={r.ticker} className="border-b border-border/10 hover:bg-accent/40">
                      <td className="p-2 text-muted-foreground font-mono">{r.rank}</td>
                      <td className="p-2">
                        <span className="flex items-center gap-0.5">
                          <Link href={`/stock/${r.ticker}`} className="font-medium text-primary hover:underline">
                            {r.ticker}
                          </Link>
                          <WatchlistStar ticker={r.ticker} />
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <LivePrice price={live} currency="$" live={live != null} className="text-xs" />
                      </td>
                      <td className={`p-2 text-right font-mono ${
                        r.prob_profit_pct == null ? "text-muted-foreground" : r.prob_profit_pct >= 50 ? "text-signal-long" : "text-signal-short"
                      }`}>
                        {r.prob_profit_pct == null ? "—" : `${r.prob_profit_pct.toFixed(0)}%`}
                      </td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{r.sector ?? "—"}</td>
                      <td className={`p-2 text-right font-mono ${r.composite_z >= 0 ? "text-signal-long" : "text-signal-short"}`}>
                        {r.composite_z >= 0 ? "+" : ""}
                        {r.composite_z.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-muted-foreground hidden md:table-cell">
                        {r.percentile.toFixed(0)}
                      </td>
                      <td className={`p-2 ${BUCKET_STYLE[r.bucket]}`}>
                        <span className="flex items-center justify-center gap-1 capitalize">
                          {bucketIcon(r.bucket)}
                          {r.bucket}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <VerdictBadge state={verdictMap?.[r.ticker]?.state} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
