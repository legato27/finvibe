"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/store/useAppStore";
import { InfoTip } from "@/components/shared/InfoTip";

const STATES = ["Expansion", "Peak", "Contraction", "Trough"] as const;
type CycleState = typeof STATES[number];

const STATE_VISUAL: Record<CycleState, {
  color: string;
  icon: string;
  abbr: string;
  phaseKey: string;
  descKey: string;
  signalKey: string;
  detailKey: string;
  assetKeys: string[];
}> = {
  Expansion: {
    color: "#22c55e",
    icon: "↑",
    abbr: "EXPN",
    phaseKey: "cyclePhaseExpansion",
    descKey: "cycleDescExpansion",
    signalKey: "cycleSignalRiskOn",
    detailKey: "cycleDetailExpansion",
    assetKeys: ["cycleAssetEquities", "cycleAssetCyclicals", "cycleAssetRealEstate", "cycleAssetCommodities"],
  },
  Peak: {
    color: "#f59e0b",
    icon: "⬆",
    abbr: "PEAK",
    phaseKey: "cyclePhasePeak",
    descKey: "cycleDescPeak",
    signalKey: "cycleSignalRotateDefensive",
    detailKey: "cycleDetailPeak",
    assetKeys: ["cycleAssetValueStocks", "cycleAssetEnergy", "cycleAssetMaterials", "cycleAssetShortDuration"],
  },
  Contraction: {
    color: "#ef4444",
    icon: "↓",
    abbr: "CONT",
    phaseKey: "cyclePhaseContraction",
    descKey: "cycleDescContraction",
    signalKey: "cycleSignalRiskOff",
    detailKey: "cycleDetailContraction",
    assetKeys: ["cycleAssetGovBonds", "cycleAssetUtilities", "cycleAssetHealthcare", "cycleAssetGold"],
  },
  Trough: {
    color: "#8b5cf6",
    icon: "↗",
    abbr: "TRGH",
    phaseKey: "cyclePhaseTrough",
    descKey: "cycleDescTrough",
    signalKey: "cycleSignalAccumulate",
    detailKey: "cycleDetailTrough",
    assetKeys: ["cycleAssetGrowthEquities", "cycleAssetSmallCaps", "cycleAssetHighYield", "cycleAssetEmergingMkts"],
  },
};

const INDICATOR_KEYS: Record<string, string> = {
  yield_curve_spread: "indicatorYieldCurve",
  yield_curve: "indicatorYieldCurve",
  unemployment_rate: "indicatorUnemployment",
  unemployment: "indicatorUnemployment",
  cpi_yoy_pct: "indicatorCpiYoy",
  cpi_yoy: "indicatorCpiYoy",
  industrial_prod_yoy_pct: "indicatorIndustrialProd",
  industrial_prod_yoy: "indicatorIndustrialProd",
  consumer_sentiment: "indicatorConsumerSent",
};

export function BusinessCycleWheel() {
  const t = useTranslations("dashboard");
  const cycle = useAppStore((s) => s.macro.businessCycle);
  const [showLegend, setShowLegend] = useState(false);

  const getIndicatorLabel = (key: string): string => {
    const tk = INDICATOR_KEYS[key];
    if (tk) return t(tk);
    return key.replace(/_/g, " ").replace(/\b(pct|yoy)\b/gi, "").trim();
  };

  if (!cycle) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-slate-500 text-sm animate-pulse">{t("cycleDetecting")}</div>
      </div>
    );
  }

  const currentState = (cycle.state ?? "Expansion") as CycleState;
  const currentVisual = STATE_VISUAL[currentState] ?? STATE_VISUAL.Expansion;
  const cx = 88, cy = 88, r = 66;

  return (
    <div className="card h-full">
      {/* Header */}
      <div className="card-header">
        <span className="card-title flex items-center gap-1">
          {t("businessCycle")}
          <InfoTip tip={t("cycleInfo")} />
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
          >
            {showLegend ? t("cycleHideLegend") : t("cycleShowLegend")}
          </button>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{
              color: currentVisual.color,
              backgroundColor: `${currentVisual.color}22`,
              border: `1px solid ${currentVisual.color}44`,
            }}
          >
            {t(currentVisual.phaseKey)}
          </span>
        </div>
      </div>

      {/* Legend panel */}
      {showLegend && (
        <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/60 p-3 text-xs space-y-3">
          <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            {t("cycleLegendTitle")}
          </div>
          {STATES.map((s) => {
            const cfg = STATE_VISUAL[s];
            const isActive = s === currentState;
            return (
              <div key={s} className={`flex gap-2.5 p-2 rounded ${isActive ? "bg-slate-800/70" : ""}`}>
                <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold" style={{ color: cfg.color }}>{t(cfg.phaseKey)}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}
                    >
                      {t(cfg.signalKey)}
                    </span>
                    {isActive && <span className="text-[10px] text-slate-400">{t("cycleCurrentMark")}</span>}
                  </div>
                  <p className="text-slate-400 leading-relaxed">{t(cfg.detailKey)}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-500">{t("cycleFavour")} </span>
                    {cfg.assetKeys.map((ak) => (
                      <span key={ak} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">{t(ak)}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-600 pt-1 border-t border-slate-800">
            {t("cycleModelNote")}
          </p>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* SVG Wheel */}
        <svg width={176} height={176} className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={20} />

          {STATES.map((state, i) => {
            const startAngle = -90 + i * 90;
            const endAngle = startAngle + 87;
            const isActive = state === currentState;
            const cfg = STATE_VISUAL[state];
            const toRad = (deg: number) => (deg * Math.PI) / 180;

            const x1 = cx + r * Math.cos(toRad(startAngle + 2));
            const y1 = cy + r * Math.sin(toRad(startAngle + 2));
            const x2 = cx + r * Math.cos(toRad(endAngle));
            const y2 = cy + r * Math.sin(toRad(endAngle));

            // Label outside the ring at arc midpoint
            const midAngle = startAngle + 44;
            const lx = cx + (r + 22) * Math.cos(toRad(midAngle));
            const ly = cy + (r + 22) * Math.sin(toRad(midAngle));

            return (
              <g key={state}>
                <path
                  d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                  fill="none"
                  stroke={isActive ? cfg.color : `${cfg.color}38`}
                  strokeWidth={isActive ? 22 : 17}
                  strokeLinecap="round"
                />
                <text
                  x={lx} y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={7.5}
                  fontWeight={isActive ? "bold" : "normal"}
                  fill={isActive ? cfg.color : "#475569"}
                >
                  {cfg.abbr}
                </text>
              </g>
            );
          })}

          {/* Centre */}
          <circle cx={cx} cy={cy} r={34} fill="#0a0a12" />
          <text x={cx} y={cy - 9} textAnchor="middle" fontSize={18} fill={currentVisual.color}>
            {currentVisual.icon}
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#94a3b8">
            {currentVisual.abbr}
          </text>
        </svg>

        {/* Right panel */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">

          {/* Probabilities */}
          <div>
            <div className="text-xs text-slate-500 mb-1.5">{t("cycleStateProbabilities")}</div>
            {STATES.map((state) => {
              const prob = ((cycle.probabilities?.[state] ?? 0) as number);
              const cfg = STATE_VISUAL[state];
              const isActive = state === currentState;
              return (
                <div key={state} className="flex items-center gap-2 mb-1">
                  <div
                    className="text-xs w-[76px] flex-shrink-0"
                    style={{ color: isActive ? cfg.color : "#64748b" }}
                  >
                    {t(cfg.phaseKey)}
                  </div>
                  <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${prob * 100}%`, backgroundColor: cfg.color }}
                    />
                  </div>
                  <div
                    className="text-xs font-mono w-9 text-right tabular-nums flex-shrink-0"
                    style={{ color: isActive ? cfg.color : "#64748b" }}
                  >
                    {(prob * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current phase description */}
          <div
            className="text-xs italic leading-relaxed px-2 py-1.5 rounded"
            style={{
              color: currentVisual.color,
              backgroundColor: `${currentVisual.color}11`,
              borderLeft: `2px solid ${currentVisual.color}60`,
            }}
          >
            <span className="font-semibold not-italic">{t(currentVisual.signalKey)}: </span>
            {t(currentVisual.descKey)}
          </div>

          {/* Macro indicators */}
          {cycle.indicator_values && (
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(cycle.indicator_values as Record<string, number>)
                .slice(0, 4)
                .map(([key, val]) => (
                  <div key={key} className="bg-slate-800/50 rounded p-1.5">
                    <div className="text-[10px] text-slate-500 leading-tight truncate">
                      {getIndicatorLabel(key)}
                    </div>
                    <div className="font-mono text-xs font-semibold">
                      {typeof val === "number" ? val.toFixed(2) : String(val)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
