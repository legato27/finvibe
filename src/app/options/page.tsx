"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { modelsApi } from "@/lib/api";

interface Level { support: number; resistance: number; expected_move: number; iv_pct?: number }
interface OptRow {
  rank: number;
  ticker: string;
  sector: string | null;
  price: number;
  realized_vol_ann_pct: number;
  fwd_vol_ann_pct: number | null;
  vol_percentile: number;
  atm_iv_pct?: number | null;
  total_oi?: number | null;
  iv_source?: "polygon" | "realized_proxy";
  trend: "up" | "down" | "neutral";
  strategy: "Sell Puts" | "Sell Calls" | "Sell Strangle";
  score: number;
  sell_put_score: number;
  sell_call_score: number;
  levels: Record<string, Level>;
}
interface OptBook {
  universe_size: number;
  vol_gate_percentile: number;
  horizons: string[];
  iv_source?: "polygon" | "realized_proxy";
  iv_proxy_note: string;
  ranked: OptRow[];
}

const STRAT_STYLE: Record<string, string> = {
  "Sell Puts": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Sell Calls": "bg-red-500/15 text-red-300 border-red-500/30",
  "Sell Strangle": "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function trendIcon(t: string) {
  if (t === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (t === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

const usd = (x: number) => `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function OptionsBookPage() {
  const [filter, setFilter] = useState<"all" | "Sell Puts" | "Sell Calls" | "Sell Strangle">("all");
  const { data, isLoading, error } = useQuery<OptBook>({
    queryKey: ["options-ranked"],
    queryFn: () => modelsApi.optionsRanked(),
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Options Ranked Book</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Premium-selling screener — elevated-volatility names scored for selling puts vs calls, with support /
          resistance and expected move for 14 / 30 / 45 DTE.
        </p>
      </div>

      {/* IV source note */}
      {data?.iv_source === "polygon" ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-[11px] text-emerald-200/90 leading-relaxed flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>Real option-market IV</b> (Polygon) for US names — ATM IV, per-DTE IV, expected move and open interest from the
            live chain. Non-US names fall back to a realized-vol proxy. IV <b>rank/percentile</b> (vs each name&rsquo;s own IV
            history) is the next upgrade.
          </span>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-200/90 leading-relaxed flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            No live options feed — &ldquo;elevated IV&rdquo; is proxied by <b>realized-volatility percentile</b>, and the
            expected move is vol-implied, not from the option market. A screener for likely-rich-premium setups, not exact
            strikes/premiums.
          </span>
        </div>
      )}

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">Scanning for elevated-vol setups…</div>}
      {error && <div className="card p-6 text-sm text-red-400">Failed to load.</div>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{data.universe_size} elevated-vol names (RV ≥ p{data.vol_gate_percentile})</span>
          </div>

          <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
            {(["all", "Sell Puts", "Sell Calls", "Sell Strangle"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground/80"
                }`}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {data.ranked
              .filter((r) => filter === "all" || r.strategy === filter)
              .map((r) => (
                <div key={r.ticker} className="card p-3">
                  {/* header */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-muted-foreground font-mono text-xs w-6">{r.rank}</span>
                    <Link href={`/stock/${r.ticker}`} className="font-semibold text-primary hover:underline w-16">
                      {r.ticker}
                    </Link>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${STRAT_STYLE[r.strategy]}`}>
                      {r.strategy}
                    </span>
                    <span className="font-mono text-sm">{usd(r.price)}</span>
                    {r.atm_iv_pct != null && (
                      <span className="text-[11px] flex items-center gap-1">
                        IV <span className="font-mono text-emerald-300">{r.atm_iv_pct}%</span>
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      RV <span className="font-mono text-foreground/80">{r.realized_vol_ann_pct}%</span>
                      <span className="text-muted-foreground/70">(p{r.vol_percentile})</span>
                    </span>
                    {r.total_oi != null && (
                      <span className="text-[11px] text-muted-foreground">OI {r.total_oi.toLocaleString()}</span>
                    )}
                    <span className="text-[11px] flex items-center gap-1">{trendIcon(r.trend)}{r.trend}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      score <span className="font-mono text-foreground/80">{r.score.toFixed(2)}</span>
                    </span>
                  </div>
                  {/* levels per horizon */}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {data.horizons.map((h) => {
                      const L = r.levels[h];
                      if (!L) return null;
                      return (
                        <div key={h} className="bg-accent/20 border border-border/20 rounded p-2 text-[10px]">
                          <div className="text-muted-foreground uppercase tracking-wider mb-0.5">{h} DTE</div>
                          <div className="font-mono text-foreground/80">
                            S {usd(L.support)} · R {usd(L.resistance)}
                          </div>
                          <div className="text-muted-foreground">
                            exp. move ±{usd(L.expected_move)}
                            {L.iv_pct != null && <span className="text-emerald-300/80"> · IV {L.iv_pct}%</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
