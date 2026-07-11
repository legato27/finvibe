"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { stocksApi } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus, Zap, AlertTriangle } from "lucide-react";

/* ── Types (mirror backend analyze_price_action) ── */
interface Structure {
  type: string;
  clarity: string;
  range_high: number;
  range_low: number;
  sma20: number;
  sma50: number;
}
interface Timeframe {
  timeframe: string;
  last_close: number;
  structure: Structure;
  direction: "long" | "short" | null;
  setup: string;
  rsi: number;
  confidence: string;
  in_sweet_spot: boolean;
  sweet_spot: { low: number; high: number } | null;
}
interface Synthesis {
  headline: string;
  setup_code: string;
  direction_label?: string | null;
  status: "triggered" | "watch" | "no_setup";
  direction: "long" | "short" | null;
  confidence: string;
  conviction_score: number;
  zone_lost?: boolean;
  key_levels: {
    sweet_spot: { low: number; high: number } | null;
    invalidation: number | null;
    structural_target: number | null;
    support_resistance: Record<string, number>;
  };
  trade_plan?: {
    action: string;
    entry_zone: { low: number; high: number } | null;
    entry_refinement?: { low: number; high: number } | null;
    stop: number | null;
    target: number | null;
    reward_risk: number | null;
    rr_min?: number | null;
    note: string;
  } | null;
  invalidation: string;
  divergence: { status: string; implication: string; rsi_now: number };
  accum_dist: { present: string; notes: string } | null;
  majority_flush?: { qualified: boolean; flush_pct: number | null } | null;
  manipulation?: { type: string; dir: string; level: number; date: string } | null;
  market_context?: { benchmark: string; structure: string; tide: string } | null;
  binary_event?: { next_earnings_date: string; days_away: number } | null;
  warnings?: string[];
  last_close: number;
}
interface Gate {
  status: "qualified" | "below_bar" | "measuring";
  qualified: boolean | null;
  measured_hit_rate: number | null;
  sample_n: number | null;
}
interface PriceActionData {
  ticker: string;
  as_of: string;
  timeframes: { daily: Timeframe | null; weekly: Timeframe | null; monthly: Timeframe | null };
  synthesis: Synthesis;
  gate?: Gate | null;
}

/* ── Helpers ── */
function dirColor(direction: string | null) {
  if (direction === "long") return { text: "text-signal-long", bg: "bg-success/10", border: "border-success/30" };
  if (direction === "short") return { text: "text-signal-short", bg: "bg-danger/10", border: "border-danger/30" };
  return { text: "text-signal-caution", bg: "bg-warning/10", border: "border-warning/30" };
}
function structDir(type: string): "long" | "short" | null {
  if (type === "UC" || type.startsWith("UR")) return "long";
  if (type === "DC" || type.startsWith("DR")) return "short";
  return null;
}
function DirIcon({ direction, className }: { direction: string | null; className?: string }) {
  if (direction === "long") return <TrendingUp className={className} />;
  if (direction === "short") return <TrendingDown className={className} />;
  return <Minus className={className} />;
}
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function PriceActionAnalysis({ ticker }: { ticker: string }) {
  const t = useTranslations("priceAction");
  const { data, isLoading, error } = useQuery<PriceActionData>({
    queryKey: ["price-action", ticker],
    queryFn: () => stocksApi.priceAction(ticker),
    staleTime: 5 * 60 * 1000,
    // retry: a single failed fetch (e.g. mid-deploy) used to blank this panel
    // while the verdict card still showed the persisted PAM read.
    retry: 2,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="card animate-pulse h-48" />;
  if (error || !data?.synthesis) {
    return (
      <div className="card text-xs text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {t("empty")}
      </div>
    );
  }

  const syn = data.synthesis;
  const c = dirColor(syn.direction);
  const kl = syn.key_levels || ({} as Synthesis["key_levels"]);
  const order: Array<keyof PriceActionData["timeframes"]> = ["monthly", "weekly", "daily"];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> {t("title")}
        </span>
        <span className="flex items-center gap-1.5">
          {data.gate && (
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                data.gate.status === "qualified"
                  ? "bg-success/10 text-signal-long border-success/30"
                  : data.gate.status === "below_bar"
                  ? "bg-danger/10 text-signal-short border-danger/30"
                  : "bg-accent/30 text-muted-foreground border-border/40"
              }`}
              title={t("gateTitle")}
            >
              {data.gate.status === "qualified" && data.gate.measured_hit_rate != null
                ? `${t("gate.qualified")} ${(data.gate.measured_hit_rate * 100).toFixed(0)}% (n=${data.gate.sample_n})`
                : t(`gate.${data.gate.status}`)}
            </span>
          )}
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>
            {syn.setup_code}
          </span>
        </span>
      </div>

      {/* Headline + conviction */}
      <div className={`flex items-center gap-2 rounded-lg border p-3 mb-3 ${c.bg} ${c.border}`}>
        <DirIcon direction={syn.direction} className={`w-5 h-5 flex-shrink-0 ${c.text}`} />
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground/90">{syn.headline}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {t("status")}: <span className={c.text}>{t(`statusVal.${syn.status}`)}</span> · {t("conviction")}:{" "}
            <span className={c.text}>{syn.confidence}</span> ({syn.conviction_score}/95)
            {syn.direction_label && <> · {syn.direction_label}</>}
            {syn.market_context?.tide && (
              <>
                {" · "}
                {t("tide")}:{" "}
                <span
                  className={
                    syn.market_context.tide === "bull"
                      ? "text-signal-long"
                      : syn.market_context.tide === "bear"
                      ? "text-signal-short"
                      : "text-signal-caution"
                  }
                >
                  {syn.market_context.benchmark} {syn.market_context.tide}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Course-rule warnings (divergence, flush, tide, earnings, zone lost) */}
      {!!syn.warnings?.length && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 mb-3 space-y-1">
          {syn.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-signal-caution" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key levels (pure price action) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">{t("sweetSpot")}</div>
          <div className="font-mono text-foreground/90">
            {kl.sweet_spot ? `${fmt(kl.sweet_spot.low)} – ${fmt(kl.sweet_spot.high)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">{t("invalidation")}</div>
          <div className="font-mono text-signal-short">{fmt(kl.invalidation)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">{t("structuralTarget")}</div>
          <div className="font-mono text-signal-long">{fmt(kl.structural_target)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">{t("lastClose")}</div>
          <div className="font-mono text-foreground/90">{fmt(syn.last_close)}</div>
        </div>
      </div>

      {/* Trade plan — deterministic recommendation from the structural levels */}
      {syn.trade_plan?.action && (
        <div
          className={`rounded-lg border p-3 mb-3 ${
            syn.trade_plan.action.startsWith("enter")
              ? "border-success/30 bg-success/5"
              : syn.trade_plan.action.startsWith("wait")
              ? "border-warning/30 bg-warning/5"
              : "border-border/40 bg-accent/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold ${
                syn.trade_plan.action.startsWith("enter")
                  ? "text-signal-long"
                  : syn.trade_plan.action.startsWith("wait")
                  ? "text-signal-caution"
                  : "text-muted-foreground"
              }`}
            >
              {t("tradePlan")}: {t(`planAction.${syn.trade_plan.action}`)}
            </span>
            {syn.trade_plan.reward_risk != null && (
              <span className="font-mono text-[11px] text-foreground/80">
                {t("rewardRisk")} {Number(syn.trade_plan.reward_risk).toFixed(2)}:1
                {syn.trade_plan.rr_min != null && (
                  <span className="text-muted-foreground"> ({t("rrMin")} {syn.trade_plan.rr_min}:1)</span>
                )}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] mt-2">
            <div>
              <span className="text-muted-foreground">{t("entryZone")}: </span>
              <span className="font-mono">
                {syn.trade_plan.entry_zone
                  ? `${fmt(syn.trade_plan.entry_zone.low)}–${fmt(syn.trade_plan.entry_zone.high)}`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("refinedEntry")}: </span>
              <span className="font-mono">
                {syn.trade_plan.entry_refinement
                  ? `${fmt(syn.trade_plan.entry_refinement.low)}–${fmt(syn.trade_plan.entry_refinement.high)}`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("stop")}: </span>
              <span className="font-mono text-signal-short">{fmt(syn.trade_plan.stop)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("target")}: </span>
              <span className="font-mono text-signal-long">{fmt(syn.trade_plan.target)}</span>
            </div>
          </div>
          {syn.trade_plan.note && (
            <p className="text-[11px] text-muted-foreground mt-1">{syn.trade_plan.note}</p>
          )}
        </div>
      )}

      {/* Manipulation signature + majority flush (course context) */}
      {(syn.manipulation || syn.majority_flush) && (
        <div className="space-y-1 mb-3 text-[11px]">
          {syn.manipulation && (
            <div className="text-muted-foreground">
              <span className="text-foreground/70">{t("manipulation")}: </span>
              {syn.manipulation.type === "spring" ? t("spring") : t("utad")} @{" "}
              <span className="font-mono">{fmt(syn.manipulation.level)}</span> ({syn.manipulation.date})
            </div>
          )}
          {syn.majority_flush && (
            <div className="text-muted-foreground">
              <span className="text-foreground/70">{t("majorityFlush")}: </span>
              {syn.majority_flush.qualified ? t("mfQualified") : t("mfNotQualified")}
              {syn.majority_flush.flush_pct != null && (
                <span className="font-mono"> ({Math.round(syn.majority_flush.flush_pct * 100)}%)</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Divergence + accumulation/distribution */}
      {(syn.divergence?.status && syn.divergence.status !== "None") ||
      (syn.accum_dist && syn.accum_dist.present !== "No" && syn.accum_dist.present !== "Unknown") ? (
        <div className="space-y-1 mb-3 text-[11px]">
          {syn.divergence?.status && syn.divergence.status !== "None" && (
            <div className="text-muted-foreground">
              <span className="text-foreground/70">{t("divergence")}: </span>
              {syn.divergence.status} — {syn.divergence.implication}
            </div>
          )}
          {syn.accum_dist && syn.accum_dist.present !== "No" && syn.accum_dist.present !== "Unknown" && (
            <div className="text-muted-foreground">
              <span className="text-foreground/70">{t("accumDist")}: </span>
              {syn.accum_dist.present} — {syn.accum_dist.notes}
            </div>
          )}
        </div>
      ) : null}

      {/* Per-timeframe top-down rows */}
      <div className="border-t border-border/30 pt-2">
        <div className="grid grid-cols-12 text-[10px] text-muted-foreground uppercase tracking-wide pb-1">
          <div className="col-span-3">{t("timeframe")}</div>
          <div className="col-span-4">{t("structure")}</div>
          <div className="col-span-3">{t("setup")}</div>
          <div className="col-span-2 text-right">RSI</div>
        </div>
        {order.map((key) => {
          const f = data.timeframes[key];
          if (!f) return null;
          const fc = dirColor(structDir(f.structure.type));
          return (
            <div key={key} className="grid grid-cols-12 items-center py-1.5 border-t border-border/10 text-xs">
              <div className="col-span-3 font-medium capitalize">{t(`tf.${key}`)}</div>
              <div className="col-span-4 flex items-center gap-1.5">
                <span className={`font-mono ${fc.text}`}>{f.structure.type}</span>
                <span className="text-[10px] text-muted-foreground">({f.structure.clarity})</span>
                {f.in_sweet_spot && (
                  <span className="text-[9px] px-1 rounded bg-primary/15 text-primary">{t("inZone")}</span>
                )}
              </div>
              <div className="col-span-3 font-mono text-foreground/80">{f.setup}</div>
              <div className="col-span-2 text-right font-mono text-foreground/70">{f.rsi}</div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">{t("disclaimer")}</p>
    </div>
  );
}
