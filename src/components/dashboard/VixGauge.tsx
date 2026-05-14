"use client";
import { useTranslations } from "next-intl";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { useAppStore } from "@/store/useAppStore";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { TrendingDown, TrendingUp } from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

const VIX_MAX = 80;

const ZONE_COLORS: Record<string, string> = {
  COMPLACENCY: "#22c55e",
  LOW_VOLATILITY: "#86efac",
  NORMAL: "#fbbf24",
  ELEVATED: "#f97316",
  EXTREME_FEAR: "#ef4444",
};

const ZONE_KEY_MAP: Record<string, string> = {
  COMPLACENCY: "vixZoneComplacency",
  LOW_VOLATILITY: "vixZoneLowVol",
  NORMAL: "vixZoneNormal",
  ELEVATED: "vixZoneElevated",
  EXTREME_FEAR: "vixZoneExtremeFear",
};

const STRUCTURE_COLORS: Record<string, string> = {
  contango: "#22c55e",
  mild_contango: "#86efac",
  flat: "#fbbf24",
  mild_backwardation: "#f97316",
  backwardation: "#ef4444",
};

const STRUCTURE_KEY_MAP: Record<string, string> = {
  contango: "vixStructContango",
  mild_contango: "vixStructMildContango",
  flat: "vixStructFlat",
  mild_backwardation: "vixStructMildBackwardation",
  backwardation: "vixStructBackwardation",
};

export function VixGauge() {
  const t = useTranslations("dashboard");
  const vix = useAppStore((s) => s.macro.vix);

  // Fetch term structure separately (included in dashboard call but also standalone)
  const { data: termStructure } = useQuery({
    queryKey: ["vix_term_structure"],
    queryFn: macroApi.vixTermStructure,
    staleTime: 60_000 * 5,
  });

  if (!vix) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-slate-500 text-sm animate-pulse">{t("vixLoading")}</div>
      </div>
    );
  }

  const value = Math.min(vix.current, VIX_MAX);
  const pct = (value / VIX_MAX) * 100;
  const color = ZONE_COLORS[vix.zone] || "#94a3b8";
  const data = [{ name: "VIX", value: pct, fill: color }];

  const ts = termStructure?.levels;
  const tsColor = STRUCTURE_COLORS[termStructure?.structure] || "#94a3b8";

  const zoneLabel = ZONE_KEY_MAP[vix.zone]
    ? t(ZONE_KEY_MAP[vix.zone])
    : String(vix.zone).replace(/_/g, " ").replace("VOLATILITY", "VOL");
  const zoneTitle = String(vix.zone).replace(/_/g, " ");
  const structureLabel = termStructure?.structure && STRUCTURE_KEY_MAP[termStructure.structure]
    ? t(STRUCTURE_KEY_MAP[termStructure.structure])
    : termStructure?.structure?.replace(/_/g, " ").toUpperCase();

  const stats = [
    { labelKey: "vix52wLow", value: vix.low_52w, tipKey: "vix52wLowTip" },
    { labelKey: "vix52wAvg", value: vix.avg_52w, tipKey: "vix52wAvgTip" },
    { labelKey: "vix52wHigh", value: vix.high_52w, tipKey: "vix52wHighTip" },
  ];

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header flex-shrink-0">
        <span className="card-title flex items-center gap-1">
          {t("vix")}
          <InfoTip tip={t("vixInfo")} />
        </span>
        <span
          className="text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded"
          style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}44` }}
          title={zoneTitle}
        >
          {zoneLabel}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 flex-1 overflow-y-auto">
        {/* Gauge */}
        <div className="relative w-32 h-32 sm:w-40 sm:h-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%" cy="50%"
              innerRadius="65%" outerRadius="90%"
              startAngle={180} endAngle={0}
              data={data}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar
                background={{ fill: "#1e293b" }}
                dataKey="value"
                cornerRadius={6}
                angleAxisId={0}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
            <span className="text-2xl sm:text-3xl font-bold font-mono" style={{ color }}>
              {vix.current.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">{t("vix")}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-2 sm:gap-3 flex-1 w-full">
          <div>
            <div className="stat-label text-xs">{t("vix24hChange")}</div>
            <div className={`flex items-center gap-1 text-base sm:text-lg font-mono font-semibold ${vix.change >= 0 ? "text-red-400" : "text-green-400"}`}>
              {vix.change >= 0 ? <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />}
              {vix.change >= 0 ? "+" : ""}{vix.change.toFixed(2)} ({vix.change_pct.toFixed(1)}%)
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {stats.map(({ labelKey, value: v, tipKey }) => {
              const tip = t(tipKey);
              return (
                <div key={labelKey} className="bg-slate-800/50 rounded p-1.5 sm:p-2 cursor-help" title={tip}>
                  <div className="text-[10px] sm:text-xs text-slate-500 flex items-center justify-center gap-0.5">
                    {t(labelKey)} <InfoTip tip={tip} size={10} />
                  </div>
                  <div className="font-mono font-semibold text-xs sm:text-sm">{v.toFixed(1)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── VIX Term Structure Strip ── */}
      {ts && (
        <div className="border-t border-border/50 mt-2 pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500 font-medium flex items-center gap-0.5">
              {t("vixTermStructure")}
              <InfoTip size={10} tip={t("vixTermStructureTip")} />
            </span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ color: tsColor, backgroundColor: `${tsColor}18`, border: `1px solid ${tsColor}33` }}
            >
              {structureLabel}
            </span>
          </div>
          <div className="flex gap-1">
            {(["VIX9D", "VIX", "VIX3M", "VIX6M"] as const).map((key, i, arr) => {
              const val = ts[key];
              const prev = i > 0 ? ts[arr[i - 1]] : null;
              const isHigher = prev != null && val != null && val > prev;
              const isLower = prev != null && val != null && val < prev;
              return (
                <div key={key} className="flex-1 text-center bg-slate-800/40 rounded py-1 px-1">
                  <div className="text-[9px] text-slate-500">{key}</div>
                  <div className={`text-xs font-mono font-bold ${
                    isHigher ? "text-red-400" : isLower ? "text-green-400" : "text-slate-300"
                  }`}>
                    {val?.toFixed(1) ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
          {termStructure.spread_9d_3m != null && (
            <div className="text-[9px] text-slate-500 mt-1 italic">
              {t("vixSpread9d3m")} <span className={termStructure.spread_9d_3m > 0 ? "text-red-400" : "text-green-400"}>
                {termStructure.spread_9d_3m > 0 ? "+" : ""}{termStructure.spread_9d_3m}
              </span>
              {" · "}{termStructure.structure_description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
