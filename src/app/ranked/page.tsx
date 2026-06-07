"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { modelsApi, stocksApi } from "@/lib/api";
import { useMyWatchlistTickers } from "@/lib/supabase/hooks";
import { PamBadge, type PamSummary } from "@/components/shared/PamBadge";
import { InfoTip } from "@/components/shared/InfoTip";
import { ScopeSortControls } from "@/components/shared/ScopeSortControls";

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
  pam?: PamSummary | null;
}
interface RankedBook {
  universe_size: number;
  factors: string[];
  method: string;
  excluded_insufficient_data?: { ticker: string }[];
  ranked: RankedRow[];
}

const BUCKET_STYLE: Record<string, string> = {
  long: "text-emerald-400",
  short: "text-red-400",
  neutral: "text-muted-foreground",
};
const TIPS = {
  prob:
    "Ensemble model's probability that the name is profitable over its 3-month horizon. Sort by this for highest-probability names on top.",
  composite:
    "Cross-sectional composite z-score blending momentum, value (margin of safety), moat and other factors vs the whole universe. Higher = stronger relative rank.",
  percentile:
    "Rank percentile (0–100) within the universe — 100 = top-ranked composite-z conviction.",
  signal: "Top quintile → Long, bottom quintile → Short, middle → Neutral.",
  pam: "Price Action (PAM) setup: monthly trend → weekly timing → daily trigger, coloured by direction.",
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

  const { data, isLoading, error } = useQuery<RankedBook>({
    queryKey: ["cross-sectional-ranked"],
    queryFn: () => modelsApi.crossSectional(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: myTickers } = useMyWatchlistTickers();
  const hasMine = (myTickers?.size ?? 0) > 0;
  const useMine = scope === "mine" && hasMine;

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

  // Backend rank (the `rank` column) reflects composite-z; display order follows
  // the chosen sort — prob-of-profit (default) or composite-z conviction.
  const sortKey = (r: RankedRow) =>
    sort === "prob" ? r.prob_profit_pct ?? -1 : r.composite_z;
  const visibleRows = (data?.ranked ?? [])
    .filter((r) => filter === "all" || r.bucket === filter)
    .filter((r) => !useMine || (myTickers?.has(r.ticker) ?? false))
    .slice()
    .sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Ranked Book</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Cross-sectional composite z-score across the watchlist universe — ranked by conviction (top quintile = long,
          bottom = short). Highest-conviction names first.
        </p>
      </div>

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">Computing cross-sectional ranking…</div>}
      {error && <div className="card p-6 text-sm text-red-400">Failed to load ranking.</div>}

      {data && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{data.universe_size} names</span>
            <span className="flex items-center gap-1 text-emerald-400/90">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              live prices · 60s
            </span>
            <span>·</span>
            <span>factors: {data.factors.join(", ")}</span>
          </div>

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

          {/* long / short / all */}
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
            {(["all", "long", "short"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                  filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground/80"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* legend (kept above the table — InfoTip cards would be clipped inside the scroll container) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground bg-muted/30 border border-border/30 rounded-lg px-3 py-2">
            <span className="text-foreground/70 font-medium">Legend:</span>
            <InfoTip label="Price" tip={TIPS.price} size={11} />
            <InfoTip label="Prob" tip={TIPS.prob} size={11} />
            <InfoTip label="Composite z" tip={TIPS.composite} size={11} />
            <InfoTip label="%ile" tip={TIPS.percentile} size={11} />
            <InfoTip label="Signal" tip={TIPS.signal} size={11} />
            <InfoTip label="PAM" tip={TIPS.pam} size={11} />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Ticker</th>
                  <th className="text-right p-2" title={TIPS.price}>Price</th>
                  <th className="text-right p-2" title={TIPS.prob}>Prob</th>
                  <th className="text-left p-2 hidden sm:table-cell">Sector</th>
                  <th className="text-right p-2" title={TIPS.composite}>Composite z</th>
                  <th className="text-right p-2 hidden md:table-cell" title={TIPS.percentile}>%ile</th>
                  <th className="text-center p-2" title={TIPS.signal}>Signal</th>
                  <th className="text-center p-2" title={TIPS.pam}>PAM</th>
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
                        <Link href={`/stock/${r.ticker}`} className="font-medium text-primary hover:underline">
                          {r.ticker}
                        </Link>
                      </td>
                      <td className="p-2 text-right font-mono">
                        <span className="inline-flex items-center justify-end gap-1">
                          {usd(live)}
                          {live != null && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        </span>
                      </td>
                      <td className={`p-2 text-right font-mono ${
                        r.prob_profit_pct == null ? "text-muted-foreground" : r.prob_profit_pct >= 50 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {r.prob_profit_pct == null ? "—" : `${r.prob_profit_pct.toFixed(0)}%`}
                      </td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{r.sector ?? "—"}</td>
                      <td className={`p-2 text-right font-mono ${r.composite_z >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
                        <PamBadge pam={r.pam} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted-foreground">{data.method}</p>
        </>
      )}
    </div>
  );
}
