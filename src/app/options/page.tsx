"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Star } from "lucide-react";
import { modelsApi } from "@/lib/api";
import { PamBadge, type PamSummary } from "@/components/shared/PamBadge";

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
            <span>{data.universe_size} elevated-vol names (RV ≥ p{data.vol_gate_percentile})</span>
            <button onClick={() => setShowTrack((v) => !v)} className="text-primary hover:underline">
              {showTrack ? "Hide track record" : "Show track record →"}
            </button>
          </div>

          {showTrack && <TrackRecord />}

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

          <div className="space-y-2">
            {data.ranked
              .filter((r) => filter === "all" || r.strategy === filter)
              .map((r) => (
                <RankRow key={r.ticker} r={r} profile={profile} horizons={data.horizons} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function RankRow({ r, profile, horizons }: { r: OptRow; profile: Profile; horizons: string[] }) {
  const rec = r.recommendation?.[profile];
  const bestLevel = rec ? r.levels[`${rec.best_dte}d`] : undefined;
  const em = bestLevel?.expected_move;
  const band = rec?.quant_band;

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
        <span className="text-[11px] flex items-center gap-1">
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
        <span className="text-[11px] text-muted-foreground ml-auto">
          conv <span className="font-mono text-foreground/80">{pct(r.conviction)}</span> · score{" "}
          <span className="font-mono text-foreground/80">{r.score.toFixed(2)}</span>
        </span>
      </div>

      {/* recommendation headline */}
      {rec && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
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
            <span>
              Exp. move ({rec.best_dte}d):{" "}
              <span className="font-mono text-foreground/80">
                {usd(r.price - em)} – {usd(r.price + em)}
              </span>{" "}
              (spot ± {usd(em)})
            </span>
          )}
          {rec.structural_basis && (
            <span>
              basis: <span className="text-foreground/80">{rec.structural_basis}</span>
            </span>
          )}
          {band && (band.down != null || band.up != null) && (
            <span>
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
