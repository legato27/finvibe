"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PanelPending } from "@/components/ui/Panel";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/store/useAppStore";
import { InfoTip } from "@/components/shared/InfoTip";

type SignalKey = "Black" | "Gray" | "White" | "Neutral";

/** A tone as a pair of semantic classes: `text` for figures, `bar` for fills. */
interface Tone { text: string; bar: string }

const TONE: Record<"long" | "short" | "caution" | "break" | "neutral" | "protocol", Tone> = {
  long: { text: "text-signal-long", bar: "bg-signal-long" },
  short: { text: "text-signal-short", bar: "bg-signal-short" },
  caution: { text: "text-signal-caution", bar: "bg-signal-caution" },
  break: { text: "text-signal-break", bar: "bg-signal-break" },
  neutral: { text: "text-signal-neutral", bar: "bg-signal-neutral" },
  protocol: { text: "text-protocol", bar: "bg-protocol" },
};

const SIGNAL_VISUAL: Record<SignalKey, {
  tone: Tone; badge: string; chip: string;
  labelKey: string; actionKey: string;
}> = {
  Black: {
    tone: TONE.short,
    badge: "bg-signal-short/15 text-signal-short border-signal-short/30",
    chip: "border-signal-short/25 bg-signal-short/5",
    labelKey: "swarmRiskOff", actionKey: "swarmActionBlack",
  },
  Gray: {
    tone: TONE.caution,
    badge: "bg-signal-caution/15 text-signal-caution border-signal-caution/30",
    chip: "border-signal-caution/25 bg-signal-caution/5",
    labelKey: "swarmCaution", actionKey: "swarmActionGray",
  },
  White: {
    tone: TONE.long,
    badge: "bg-signal-long/15 text-signal-long border-signal-long/30",
    chip: "border-signal-long/25 bg-signal-long/5",
    labelKey: "swarmRiskOn", actionKey: "swarmActionWhite",
  },
  Neutral: {
    tone: TONE.neutral,
    badge: "bg-muted/15 text-muted-foreground border-border/30",
    chip: "border-signal-neutral/25 bg-signal-neutral/5",
    labelKey: "swarmTransitional", actionKey: "swarmActionNeutral",
  },
};

function ScoreGauge({ score, tone }: { score: number; tone: Tone }) {
  // Score ranges -100 to +100, map to 0-100 for gauge fill
  const normalized = Math.max(0, Math.min(100, (score + 100) / 2));
  const isPositive = score >= 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
        {/* Center mark */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/30 z-10" />
        {/* Fill from center */}
        {isPositive ? (
          <div
            className={`absolute top-0 bottom-0 rounded-r-full opacity-80 transition-all duration-700 ${tone.bar}`}
            style={{ left: "50%", width: `${(normalized - 50)}%` }}
          />
        ) : (
          <div
            className={`absolute top-0 bottom-0 rounded-l-full opacity-80 transition-all duration-700 ${tone.bar}`}
            style={{ right: "50%", width: `${(50 - normalized)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between w-full text-[9px] text-muted-foreground font-mono">
        <span>-100</span>
        <span>0</span>
        <span>+100</span>
      </div>
    </div>
  );
}

function MetricBar({ label, value, max, tone, tip }: {
  label: string; value: number; max: number; tone: Tone; tip: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          {label} <InfoTip size={9} tip={tip} />
        </span>
        <span className={`text-[11px] font-mono font-bold ${tone.text}`}>
          {typeof value === "number" && value < 1 ? `${(value * 100).toFixed(0)}%` : value}
        </span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SwarmIndicator() {
  const t = useTranslations("dashboard");
  const swarm = useAppStore((s) => s.macro.swarm);

  if (!swarm) return <PanelPending label={t("swarmTitle")} text={t("swarmComputing")} className="h-full" />;

  const cfg = SIGNAL_VISUAL[swarm.signal_type as SignalKey] || SIGNAL_VISUAL.Neutral;
  const score = swarm.swarm_score;
  const herding = swarm.largest_cluster_pct;
  const noise = swarm.noise_ratio;
  const clusters = swarm.n_clusters;
  const stocks = swarm.n_stocks_analyzed || 50;

  // Conviction = inverse of noise, scaled
  const conviction = Math.round((1 - noise) * 100);

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="card-header flex-shrink-0">
        <span className="card-title flex items-center gap-1">
          {t("swarmTitle")}
          <InfoTip tip={t("swarmInfo")} />
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
            {t(cfg.labelKey)}
          </span>
          <Link href="/ranked" className="inline-flex items-center gap-0.5 text-[11px] text-signal hover:underline">
            {t("openScreener")}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {/* Score */}
        <div className="flex items-end gap-3">
          <div className={`text-4xl font-black font-mono leading-none ${cfg.tone.text}`}>
            {score > 0 ? "+" : ""}{score.toFixed(0)}
          </div>
          <div className="flex flex-col mb-0.5">
            <span className="text-[10px] text-muted-foreground">/ 100</span>
            <span className={`text-[10px] font-medium ${cfg.tone.text}`}>
              {t("swarmConviction", { pct: conviction })}
            </span>
          </div>
        </div>

        {/* Score gauge */}
        <ScoreGauge score={score} tone={cfg.tone} />

        {/* Key metrics with bars */}
        <div className="space-y-2">
          <MetricBar
            label={t("swarmHerding")}
            value={herding}
            max={1}
            tone={herding > 0.5 ? TONE.caution : TONE.long}
            tip={t("swarmHerdingTip")}
          />
          <MetricBar
            label={t("swarmNoise")}
            value={noise}
            max={1}
            tone={noise > 0.4 ? TONE.break : noise > 0.2 ? TONE.caution : TONE.long}
            tip={t("swarmNoiseTip")}
          />
          <MetricBar
            label={t("swarmClusters")}
            value={clusters}
            max={10}
            tone={TONE.protocol}
            tip={t("swarmClustersTip")}
          />
        </div>

        {/* Cluster structure summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/40 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">{t("swarmStocksAnalyzed")}</div>
            <div className="text-sm font-mono font-bold text-foreground">{stocks}</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
              {t("swarmDensityDelta")}
              <InfoTip size={9} tip={t("swarmDensityDeltaTip")} />
            </div>
            <div className={`text-sm font-mono font-bold ${
              (swarm.density_delta ?? 0) > 0 ? "text-signal-long" :
              (swarm.density_delta ?? 0) < -0.1 ? "text-signal-short" : "text-muted-foreground"
            }`}>
              {swarm.density_delta != null
                ? `${swarm.density_delta > 0 ? "+" : ""}${(swarm.density_delta * 100).toFixed(1)}%`
                : "—"}
            </div>
          </div>
        </div>

        {/* Top driving factors */}
        {swarm.top_factors?.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-0.5">
              {t("swarmTopFactors")}
              <InfoTip size={9} tip={t("swarmTopFactorsTip")} />
            </div>
            <div className="flex gap-1.5">
              {swarm.top_factors.slice(0, 3).map((f, i) => (
                <span
                  key={f}
                  className={`text-[10px] px-2 py-1 rounded border font-mono ${cfg.chip} ${i === 0 ? cfg.tone.text : "text-muted-foreground"}`}
                >
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action line */}
        <div className="mt-auto pt-1 border-t border-border/30">
          <p className={`text-[11px] leading-relaxed ${cfg.tone.text}`}>
            {t(cfg.actionKey)}
          </p>
        </div>
      </div>
    </div>
  );
}
