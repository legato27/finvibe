"use client";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/store/useAppStore";
import { InfoTip } from "@/components/shared/InfoTip";

type SignalKey = "Black" | "Gray" | "White" | "Neutral";

const SIGNAL_VISUAL: Record<SignalKey, {
  color: string; accent: string; glow: string; badge: string;
  labelKey: string; actionKey: string;
}> = {
  Black: {
    color: "#ef4444", accent: "#991b1b", glow: "shadow-red-500/20",
    badge: "bg-danger/15 text-danger border-danger/30",
    labelKey: "swarmRiskOff", actionKey: "swarmActionBlack",
  },
  Gray: {
    color: "#f59e0b", accent: "#92400e", glow: "shadow-amber-500/20",
    badge: "bg-warning/15 text-warning border-warning/30",
    labelKey: "swarmCaution", actionKey: "swarmActionGray",
  },
  White: {
    color: "#22c55e", accent: "#166534", glow: "shadow-green-500/20",
    badge: "bg-success/15 text-success border-success/30",
    labelKey: "swarmRiskOn", actionKey: "swarmActionWhite",
  },
  Neutral: {
    color: "#64748b", accent: "#1e293b", glow: "shadow-slate-500/10",
    badge: "bg-muted/15 text-muted-foreground border-border/30",
    labelKey: "swarmTransitional", actionKey: "swarmActionNeutral",
  },
};

function ScoreGauge({ score, color }: { score: number; color: string }) {
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
            className="absolute top-0 bottom-0 rounded-r-full transition-all duration-700"
            style={{
              left: "50%",
              width: `${(normalized - 50)}%`,
              backgroundColor: color,
              opacity: 0.8,
            }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 rounded-l-full transition-all duration-700"
            style={{
              right: "50%",
              width: `${(50 - normalized)}%`,
              backgroundColor: color,
              opacity: 0.8,
            }}
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

function MetricBar({ label, value, max, color, tip }: {
  label: string; value: number; max: number; color: string; tip: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          {label} <InfoTip size={9} tip={tip} />
        </span>
        <span className="text-[11px] font-mono font-bold" style={{ color }}>
          {typeof value === "number" && value < 1 ? `${(value * 100).toFixed(0)}%` : value}
        </span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function SwarmIndicator() {
  const t = useTranslations("dashboard");
  const swarm = useAppStore((s) => s.macro.swarm);

  if (!swarm) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">{t("swarmComputing")}</div>
      </div>
    );
  }

  const cfg = SIGNAL_VISUAL[swarm.signal_type as SignalKey] || SIGNAL_VISUAL.Neutral;
  const score = swarm.swarm_score;
  const herding = swarm.largest_cluster_pct;
  const noise = swarm.noise_ratio;
  const clusters = swarm.n_clusters;
  const stocks = swarm.n_stocks_analyzed || 50;

  // Conviction = inverse of noise, scaled
  const conviction = Math.round((1 - noise) * 100);

  return (
    <div className={`card h-full flex flex-col ${cfg.glow}`}>
      {/* Header */}
      <div className="card-header flex-shrink-0">
        <span className="card-title flex items-center gap-1">
          {t("swarmTitle")}
          <InfoTip tip={t("swarmInfo")} />
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.badge}`}>
          {t(cfg.labelKey)}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {/* Score */}
        <div className="flex items-end gap-3">
          <div
            className="text-4xl font-black font-mono leading-none"
            style={{ color: cfg.color }}
          >
            {score > 0 ? "+" : ""}{score.toFixed(0)}
          </div>
          <div className="flex flex-col mb-0.5">
            <span className="text-[10px] text-muted-foreground">/ 100</span>
            <span className="text-[10px] font-medium" style={{ color: cfg.color }}>
              {t("swarmConviction", { pct: conviction })}
            </span>
          </div>
        </div>

        {/* Score gauge */}
        <ScoreGauge score={score} color={cfg.color} />

        {/* Key metrics with bars */}
        <div className="space-y-2">
          <MetricBar
            label={t("swarmHerding")}
            value={herding}
            max={1}
            color={herding > 0.5 ? "#f59e0b" : "#22c55e"}
            tip={t("swarmHerdingTip")}
          />
          <MetricBar
            label={t("swarmNoise")}
            value={noise}
            max={1}
            color={noise > 0.4 ? "#ef4444" : noise > 0.2 ? "#f59e0b" : "#22c55e"}
            tip={t("swarmNoiseTip")}
          />
          <MetricBar
            label={t("swarmClusters")}
            value={clusters}
            max={10}
            color="#3b82f6"
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
              (swarm.density_delta ?? 0) > 0 ? "text-success" :
              (swarm.density_delta ?? 0) < -0.1 ? "text-danger" : "text-muted-foreground"
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
                  className="text-[10px] px-2 py-1 rounded border font-mono"
                  style={{
                    borderColor: `${cfg.color}33`,
                    backgroundColor: `${cfg.color}08`,
                    color: i === 0 ? cfg.color : "#94a3b8",
                  }}
                >
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action line */}
        <div className="mt-auto pt-1 border-t border-border/30">
          <p className="text-[11px] leading-relaxed" style={{ color: cfg.color }}>
            {t(cfg.actionKey)}
          </p>
        </div>
      </div>
    </div>
  );
}
