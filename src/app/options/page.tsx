"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Star } from "lucide-react";
import { modelsApi, stocksApi } from "@/lib/api";
import { useMyWatchlistTickers } from "@/lib/supabase/hooks";
import { PamBadge, type PamSummary } from "@/components/shared/PamBadge";
import { InfoTip } from "@/components/shared/InfoTip";
import { ScopeSortControls } from "@/components/shared/ScopeSortControls";

// Field explanations — reused by the legend (InfoTip) and inline `title` hovers.
const TIPS: Record<string, string> = {
  price: "Live price (refreshed every 60s). The strikes & expected-move band are anchored to the book's reference price; a 'ref' tag appears if the live price has drifted >1%.",
  iv: "ATM implied volatility from the live option market (Polygon), annualized. Higher IV = richer premium to sell.",
  ivRank: "IV Rank — where today's IV sits in its own 1-year low–high range (0–100). High = IV is rich vs the name's history, the classic 'sell premium now' signal. Builds up over ~20+ trading days.",
  ivPct: "IV Percentile — % of the last year's days when IV was BELOW today's. 80 = IV has rarely been this high.",
  rv: "Realized-volatility percentile — where the current 21-day realized vol sits vs this name's own 2-year history. The gate for 'elevated vol = richer premium'.",
  oi: "Total open interest across near-the-money strikes — a rough liquidity read.",
  conviction: "Strength of the quant × PAM directional lean (0–100%). Higher = quant ensemble and price-action agree more strongly.",
  score: "Overall rank score: premium richness + directional conviction + best-DTE annualized return. Halved for names with implausible (suspect) volatility.",
  strategy: "What to sell, from the blend: Sell Puts (bullish lean), Sell Calls (bearish), or Sell Strangle (neutral / strong disagreement).",
  pop: "Probability of OTM — the chance the sold option expires worthless (you keep the full premium), from a Black-Scholes model on the per-DTE IV.",
  delta: "Option delta ≈ the rough probability of assignment. ~0.30 is standard premium selling.",
  premium: "Estimated credit received per share (×100 per contract). Model estimate, not a live chain quote.",
  ann: "Annualized return if the option expires worthless = max return × 365 / DTE.",
  expMove: "Expected ±1σ move over the chosen DTE (spot ± IV×√t). The likely range, not a strike.",
  basis: "What the strike is anchored to: a PAM structural level (sweet-spot / SMA50 / monthly) when one is nearby, else a multiple of the expected move.",
  quantBand: "The quant ensemble's 3-month forecast range (p10–p90), scaled to the DTE. Shown as context — it does not move the strike.",
  pam: "Price Action (PAM) setup: monthly trend → weekly timing → daily trigger, coloured by direction. Drives the directional lean alongside quant.",
  risk: "Strike distance: Conservative = furthest OTM (highest POP, less premium); Aggressive = closest to the money (more premium, more assignment risk).",
};

type Profile = "conservative" | "balanced" | "aggressive";
type Strat = "sell_puts" | "sell_calls" | "sell_strangle";
type Breakeven = number | { low: number; high: number };

interface DteReco {
  dte: number;
  side?: string;
  strike?: number | null;
  strikes?: { put: number; call: number } | null;
  iv_pct?: number;
  expected_move: number;
  premium_est: number;
  pop: number;
  delta: number;
  breakeven?: Breakeven;
  max_return_pct: number;
  annualized_return_pct: number;
  structural_basis?: string | null;
}
interface Recommendation extends DteReco {
  strategy: Strat;
  profile: Profile;
  conviction: number;
  best_dte: number;
  rationale: string;
  agreement: string;
  quant_band?: { down: number | null; up: number | null } | null;
}
interface Lean {
  blended_score: number;
  agreement: string;
  quant: { score: number; strength: number; signal: string | null };
  pam: { score: number; strength: number; direction: string | null; setup: string | null };
}
interface Level { expected_move: number; iv_pct?: number; reco?: Record<Profile, DteReco> }
interface OptRow {
  rank: number;
  ticker: string;
  sector: string | null;
  price: number;
  realized_vol_ann_pct: number;
  vol_percentile: number;
  atm_iv_pct?: number | null;
  total_oi?: number | null;
  iv_source?: "polygon" | "realized_proxy";
  trend: "up" | "down" | "neutral";
  strategy: "Sell Puts" | "Sell Calls" | "Sell Strangle";
  score: number;
  conviction?: number;
  iv_suspect?: boolean;
  vol_note?: string | null;
  iv_rank?: number | null;
  iv_percentile?: number | null;
  recommendation?: Record<Profile, Recommendation>;
  lean?: Lean;
  levels: Record<string, Level>;
  pam?: PamSummary | null;
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
const STRAT_TEXT: Record<Strat, string> = {
  sell_puts: "text-emerald-300",
  sell_calls: "text-red-300",
  sell_strangle: "text-amber-300",
};

function trendIcon(t: string) {
  if (t === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (t === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

const usd = (x?: number | null) =>
  x == null ? "—" : `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** "$238" for single-leg, "$6P / $8C" for a strangle. */
function strikeLabel(d: { strike?: number | null; strikes?: { put: number; call: number } | null }) {
  if (d.strikes) return `${usd(d.strikes.put)}P / ${usd(d.strikes.call)}C`;
  return usd(d.strike);
}

export default function OptionsBookPage() {
  const [filter, setFilter] = useState<"all" | "Sell Puts" | "Sell Calls" | "Sell Strangle">("all");
  const [profile, setProfile] = useState<Profile>("balanced");
  const [showTrack, setShowTrack] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [sort, setSort] = useState<"pop" | "ann" | "score">("pop");

  const { data, isLoading, error } = useQuery<OptBook>({
    queryKey: ["options-ranked"],
    queryFn: () => modelsApi.optionsRanked(),
    staleTime: 60 * 60 * 1000,
  });

  const { data: myTickers } = useMyWatchlistTickers();
  const hasMine = (myTickers?.size ?? 0) > 0;
  const useMine = scope === "mine" && hasMine;

  const sortKey = (r: OptRow) =>
    sort === "pop"
      ? r.recommendation?.[profile]?.pop ?? -1
      : sort === "ann"
        ? r.recommendation?.[profile]?.annualized_return_pct ?? -1
        : r.score;
  const visibleRows = (data?.ranked ?? [])
    .filter((r) => filter === "all" || r.strategy === filter)
    .filter((r) => !useMine || (myTickers?.has(r.ticker) ?? false))
    .slice()
    .sort((a, b) => sortKey(b) - sortKey(a));

  // Live prices — the book itself is cached ~25h, so overlay realtime quotes
  // (one batched call for all names) and refresh every 60s.
  const tickers = data?.ranked.map((r) => r.ticker) ?? [];
  const { data: livePrices } = useQuery<Array<{ ticker: string; price: number | null }>>({
    queryKey: ["options-live-prices", tickers.length],
    queryFn: () => stocksApi.refreshPrices(tickers),
    enabled: tickers.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const priceMap = new Map((livePrices ?? []).map((p) => [p.ticker, p.price]));

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Options Ranked Book</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Premium-selling engine — a <b>quant × PAM</b> directional lean picks sell-puts/calls/strangle, then anchors a
          strike to price-action structure with per-DTE probability-of-OTM, premium and annualized return.
        </p>
      </div>

      {/* IV source note */}
      {data?.iv_source === "polygon" ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-[11px] text-emerald-200/90 leading-relaxed flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>Real option-market IV</b> (Polygon) for US names drives the per-DTE expected move &amp; POP. Strikes are
            anchored to PAM structure (sweet-spot / SMA50 / monthly levels); quant ensemble sets the direction and shows
            its 3-month band as context. Estimates, not live chain quotes — verify before trading.
          </span>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-200/90 leading-relaxed flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            No live options feed — &ldquo;IV&rdquo; is proxied by <b>realized-volatility</b>. A screener for likely-rich-premium
            setups with structure-anchored strikes, not exact chain quotes.
          </span>
        </div>
      )}

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">Scanning for elevated-vol setups…</div>}
      {error && <div className="card p-6 text-sm text-red-400">Failed to load.</div>}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              {data.universe_size} elevated-vol names (RV ≥ p{data.vol_gate_percentile})
              <span className="flex items-center gap-1 text-emerald-400/90">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                live prices · 60s
              </span>
            </span>
            <button onClick={() => setShowTrack((v) => !v)} className="text-primary hover:underline">
              {showTrack ? "Hide track record" : "Show track record →"}
            </button>
          </div>

          {showTrack && <TrackRecord />}

          {/* scope + sort */}
          <ScopeSortControls
            scope={scope}
            onScope={setScope}
            hasMine={hasMine}
            mineCount={myTickers?.size}
            sort={sort}
            sortOptions={[
              { value: "pop", label: "Probability (POP)" },
              { value: "ann", label: "Annualized" },
              { value: "score", label: "Score" },
            ]}
            onSort={(s) => setSort(s as "pop" | "ann" | "score")}
          />

          {/* controls */}
          <div className="flex flex-wrap items-center gap-3">
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
            {/* risk toggle */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-muted-foreground">Risk</span>
              <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30">
                {(["conservative", "balanced", "aggressive"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProfile(p)}
                    title={
                      p === "conservative"
                        ? "Furthest OTM — highest POP, smaller premium"
                        : p === "balanced"
                          ? "~0.30 delta — standard premium selling"
                          : "Closest to the money — most premium, more assignment risk"
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all ${
                      profile === p ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground/80"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* legend — what each field means */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground bg-muted/30 border border-border/30 rounded-lg px-3 py-2">
            <span className="text-foreground/70 font-medium">Legend:</span>
            <InfoTip label="IV" tip={TIPS.iv} size={11} />
            <InfoTip label="IV Rank" tip={TIPS.ivRank} size={11} />
            <InfoTip label="RV %ile" tip={TIPS.rv} size={11} />
            <InfoTip label="OI" tip={TIPS.oi} size={11} />
            <InfoTip label="Conv" tip={TIPS.conviction} size={11} />
            <InfoTip label="Score" tip={TIPS.score} size={11} />
            <span className="text-border">|</span>
            <InfoTip label="POP" tip={TIPS.pop} size={11} />
            <InfoTip label="Δ" tip={TIPS.delta} size={11} />
            <InfoTip label="Premium" tip={TIPS.premium} size={11} />
            <InfoTip label="Ann." tip={TIPS.ann} size={11} />
            <InfoTip label="Exp. move" tip={TIPS.expMove} size={11} />
            <InfoTip label="Basis" tip={TIPS.basis} size={11} />
            <InfoTip label="Quant band" tip={TIPS.quantBand} size={11} />
            <InfoTip label="PAM" tip={TIPS.pam} size={11} />
            <InfoTip label="Risk" tip={TIPS.risk} size={11} />
          </div>

          <div className="space-y-2">
            {visibleRows.length === 0 && (
              <div className="card p-6 text-sm text-muted-foreground">
                No names match. {useMine && "Your watchlist names may not be in the elevated-vol universe — try “All”."}
              </div>
            )}
            {visibleRows.map((r) => (
              <RankRow
                key={r.ticker}
                r={r}
                profile={profile}
                horizons={data.horizons}
                livePrice={priceMap.get(r.ticker) ?? null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RankRow({
  r, profile, horizons, livePrice,
}: { r: OptRow; profile: Profile; horizons: string[]; livePrice: number | null }) {
  const rec = r.recommendation?.[profile];
  const bestLevel = rec ? r.levels[`${rec.best_dte}d`] : undefined;
  const em = bestLevel?.expected_move;
  const band = rec?.quant_band;
  // Live quote overlays the cached book price; flag when they diverge so it's
  // clear the strikes/band were anchored to the reference (book-compute) price.
  const shownPrice = livePrice ?? r.price;
  const drifted = livePrice != null && r.price > 0 && Math.abs(livePrice - r.price) / r.price > 0.01;

  return (
    <div className={`card p-3 ${r.iv_suspect ? "opacity-70" : ""}`}>
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-muted-foreground font-mono text-xs w-6">{r.rank}</span>
        <Link href={`/stock/${r.ticker}`} className="font-semibold text-primary hover:underline w-16">
          {r.ticker}
        </Link>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${STRAT_STYLE[r.strategy]}`}>
          {r.strategy}
        </span>
        <span className="font-mono text-sm flex items-baseline gap-1">
          {usd(shownPrice)}
          {livePrice != null && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse self-center" />}
          {drifted && <span className="text-[10px] text-muted-foreground/70">ref {usd(r.price)}</span>}
        </span>
        {r.atm_iv_pct != null && (
          <span className="text-[11px] flex items-center gap-1" title={TIPS.iv}>
            IV <span className="font-mono text-emerald-300">{r.atm_iv_pct}%</span>
          </span>
        )}
        {r.iv_rank != null && (
          <span className="text-[11px] flex items-center gap-1" title={TIPS.ivRank}>
            IVR <span className="font-mono text-emerald-300/90">{r.iv_rank}</span>
          </span>
        )}
        <span className="text-[11px] text-muted-foreground flex items-center gap-1" title={TIPS.rv}>
          RV <span className="font-mono text-foreground/80">{r.realized_vol_ann_pct}%</span>
          <span className="text-muted-foreground/70">(p{r.vol_percentile})</span>
        </span>
        {r.total_oi != null && (
          <span className="text-[11px] text-muted-foreground" title={TIPS.oi}>
            OI {r.total_oi.toLocaleString()}
          </span>
        )}
        <span className="text-[11px] flex items-center gap-1">{trendIcon(r.trend)}{r.trend}</span>
        <span className="text-[11px] flex items-center gap-1" title={TIPS.pam}>
          <span className="text-muted-foreground">PAM</span> <PamBadge pam={r.pam} />
        </span>
        {r.iv_suspect && (
          <span
            title={r.vol_note ?? "Implausible volatility — verify before trading"}
            className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30 flex items-center gap-1"
          >
            <AlertTriangle className="w-3 h-3" /> IV suspect
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto flex gap-1">
          <span title={TIPS.conviction}>conv <span className="font-mono text-foreground/80">{pct(r.conviction)}</span></span>
          <span>·</span>
          <span title={TIPS.score}>score <span className="font-mono text-foreground/80">{r.score.toFixed(2)}</span></span>
        </span>
      </div>

      {/* recommendation headline */}
      {rec && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm" title={`${TIPS.strategy} ${TIPS.pop} ${TIPS.ann}`}>
          <span className={`font-semibold ${STRAT_TEXT[rec.strategy]}`}>{r.strategy.toUpperCase()}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono">{rec.best_dte} DTE</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono">{strikeLabel(rec)}</span>
          <span className="text-[11px] text-muted-foreground">
            ({rec.delta.toFixed(2)}Δ, ~{pct(rec.pop)} POP)
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-emerald-300/90">{rec.annualized_return_pct}% ann.</span>
        </div>
      )}

      {/* per-DTE comparison */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {horizons.map((h) => {
          const d = r.levels[h]?.reco?.[profile];
          if (!d) return null;
          const isBest = rec && d.dte === rec.best_dte;
          return (
            <div
              key={h}
              title={`Strike to sell at ${d.dte} DTE. ${TIPS.pop} ${TIPS.premium} ${TIPS.ann}`}
              className={`rounded p-2 text-[10px] border ${
                isBest ? "bg-primary/10 border-primary/40" : "bg-accent/20 border-border/20"
              }`}
            >
              <div className="text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                {h} DTE {isBest && <Star className="w-3 h-3 text-primary fill-primary" />}
              </div>
              <div className="font-mono text-foreground/90">{strikeLabel(d)}</div>
              <div className="text-muted-foreground">
                ~{pct(d.pop)} POP · {d.delta.toFixed(2)}Δ
              </div>
              <div className="text-muted-foreground">
                {usd(d.premium_est)} · <span className="text-emerald-300/80">{d.annualized_return_pct}% ann.</span>
                {d.iv_pct != null && <span className="text-muted-foreground/70"> · IV {d.iv_pct}%</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* expected-move band + structural basis + quant context (replaces S/R) */}
      {rec && (
        <div className="mt-2 text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          {em != null && (
            <span title={TIPS.expMove}>
              Exp. move ({rec.best_dte}d):{" "}
              <span className="font-mono text-foreground/80">
                {usd(r.price - em)} – {usd(r.price + em)}
              </span>{" "}
              (spot ± {usd(em)})
            </span>
          )}
          {rec.structural_basis && (
            <span title={TIPS.basis}>
              basis: <span className="text-foreground/80">{rec.structural_basis}</span>
            </span>
          )}
          {band && (band.down != null || band.up != null) && (
            <span title={TIPS.quantBand}>
              quant {rec.best_dte}d: <span className="font-mono text-foreground/70">{usd(band.down)} – {usd(band.up)}</span>
            </span>
          )}
          {rec.rationale && <span className="basis-full text-muted-foreground/80">{rec.rationale}</span>}
        </div>
      )}
    </div>
  );
}

// ── Track record ─────────────────────────────────────────────────────────────
interface ScoreAgg {
  n: number;
  win_rate: number | null;
  avg_captured_pct: number | null;
  avg_annualized_pct: number | null;
  assignment_rate: number | null;
  mean_pop_pred: number | null;
  calibration_gap: number | null;
}
interface Scorecard {
  window_days: number;
  overall: ScoreAgg;
  by_strategy: Record<string, ScoreAgg>;
  by_agreement: Record<string, ScoreAgg>;
  by_dte: Record<string, ScoreAgg>;
  latest_review?: Array<{ knob: string | null; issue: string; action: string }> | null;
  review_at?: string | null;
}
interface OpenRec {
  ticker: string;
  strategy: string;
  best_dte: number;
  put_strike: number | null;
  call_strike: number | null;
  pop_pred: number | null;
  expiry_date: string | null;
  days_left: number | null;
}

function TrackRecord() {
  const { data: sc } = useQuery<Scorecard>({
    queryKey: ["options-reco-scorecard"],
    queryFn: () => modelsApi.optionsRecoScorecard(60),
    staleTime: 30 * 60 * 1000,
  });
  const { data: openData } = useQuery<{ open: OpenRec[] }>({
    queryKey: ["options-reco-open"],
    queryFn: () => modelsApi.optionsRecoOpen(),
    staleTime: 30 * 60 * 1000,
  });
  const o = sc?.overall;
  const open = openData?.open ?? [];

  return (
    <div className="card p-3 space-y-3">
      <div className="text-sm font-semibold">Track record (last {sc?.window_days ?? 60}d)</div>
      {!o || o.n === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No resolved recommendations yet — the engine logs every pick and grades it at the option&rsquo;s expiry. The
          scorecard fills in as the first cohorts mature (~14–45 days). {open.length} open right now.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <Stat label="Win rate" value={pct(o.win_rate)} />
            <Stat label="Avg captured" value={o.avg_captured_pct != null ? `${o.avg_captured_pct}%` : "—"} />
            <Stat label="Avg ann." value={o.avg_annualized_pct != null ? `${o.avg_annualized_pct}%` : "—"} />
            <Stat label="Resolved" value={String(o.n)} />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Calibration: predicted POP <span className="font-mono text-foreground/80">{pct(o.mean_pop_pred)}</span> vs realized
            win <span className="font-mono text-foreground/80">{pct(o.win_rate)}</span>
            {o.calibration_gap != null && (
              <span className={o.calibration_gap > 0.1 ? " text-amber-300" : o.calibration_gap < -0.1 ? " text-emerald-300" : ""}>
                {" "}
                (gap {o.calibration_gap > 0 ? "+" : ""}
                {Math.round(o.calibration_gap * 100)}pp{o.calibration_gap > 0.1 ? " — over-confident" : o.calibration_gap < -0.1 ? " — under-confident" : ""})
              </span>
            )}
          </div>
          {sc?.latest_review && sc.latest_review.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              <span className="text-foreground/80">Suggested tweaks:</span>{" "}
              {sc.latest_review.map((s, i) => (
                <span key={i}>{s.action}{i < sc.latest_review!.length - 1 ? "; " : ""}</span>
              ))}
            </div>
          )}
        </>
      )}

      {open.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Open ({open.length})</div>
          <div className="max-h-48 overflow-y-auto text-[10px]">
            <table className="w-full">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="font-normal py-0.5">Ticker</th>
                  <th className="font-normal">Strategy</th>
                  <th className="font-normal">Strike</th>
                  <th className="font-normal">DTE</th>
                  <th className="font-normal">POP</th>
                  <th className="font-normal text-right">Days left</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {open.slice(0, 40).map((p, i) => (
                  <tr key={i} className="border-t border-border/20">
                    <td className="py-0.5">{p.ticker}</td>
                    <td className="text-muted-foreground">{p.strategy.replace("sell_", "")}</td>
                    <td>
                      {p.strategy === "sell_strangle"
                        ? `${usd(p.put_strike)}/${usd(p.call_strike)}`
                        : usd(p.put_strike ?? p.call_strike)}
                    </td>
                    <td>{p.best_dte}</td>
                    <td>{pct(p.pop_pred)}</td>
                    <td className="text-right">{p.days_left}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-accent/20 border border-border/20 rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-sm text-foreground/90">{value}</div>
    </div>
  );
}
