"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { BarChart3 } from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

const SIGNAL_KEY_MAP: Record<string, string> = {
  broad_strength: "breadthSigBroadStrength",
  broad_weakness: "breadthSigBroadWeakness",
  narrowing: "breadthSigNarrowing",
};

export function BreadthStrip() {
  const t = useTranslations("dashboard");
  const { data: breadth } = useQuery({
    queryKey: ["breadth"],
    queryFn: macroApi.breadth,
    staleTime: 60_000 * 5,
  });

  if (!breadth || breadth.error) {
    return null; // silent fail — strip just doesn't show
  }

  const signalColor = breadth.signal === "broad_strength" ? "text-green-400 bg-green-500/10"
    : breadth.signal === "broad_weakness" ? "text-red-400 bg-red-500/10"
    : breadth.signal === "narrowing" ? "text-amber-400 bg-amber-500/10"
    : "text-slate-400 bg-slate-800";

  const signalLabel = breadth.signal && SIGNAL_KEY_MAP[breadth.signal]
    ? t(SIGNAL_KEY_MAP[breadth.signal])
    : t("breadthSigNeutral");

  return (
    <div className="card">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            {t("breadthTitle")}
            <InfoTip tip={t("breadthInfo")} />
          </span>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${signalColor}`}>
          {signalLabel}
        </span>
      </div>
      <div className="flex divide-x divide-border/30">
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5">
            {t("breadthPctAbove50")} <InfoTip size={10} tip={t("breadthPctAbove50Tip")} />
          </div>
          <div className={`text-lg font-bold font-mono ${breadth.pct_above_50dma == null ? "text-muted-foreground" : breadth.pct_above_50dma > 60 ? "text-green-400" : breadth.pct_above_50dma > 40 ? "text-yellow-400" : "text-red-400"}`}>
            {breadth.pct_above_50dma != null ? `${breadth.pct_above_50dma}%` : "—"}
          </div>
          {breadth.pct_above_50dma_chg != null && (
            <div className={`text-[10px] font-mono ${breadth.pct_above_50dma_chg >= 0 ? "text-green-500" : "text-red-500"}`}>
              {breadth.pct_above_50dma_chg >= 0 ? "+" : ""}{breadth.pct_above_50dma_chg}%
            </div>
          )}
        </div>
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5">
            {t("breadthPctAbove200")} <InfoTip size={10} tip={t("breadthPctAbove200Tip")} />
          </div>
          <div className={`text-lg font-bold font-mono ${breadth.pct_above_200dma == null ? "text-muted-foreground" : breadth.pct_above_200dma > 60 ? "text-green-400" : breadth.pct_above_200dma > 40 ? "text-yellow-400" : "text-red-400"}`}>
            {breadth.pct_above_200dma != null ? `${breadth.pct_above_200dma}%` : "—"}
          </div>
          {breadth.pct_above_200dma_chg != null && (
            <div className={`text-[10px] font-mono ${breadth.pct_above_200dma_chg >= 0 ? "text-green-500" : "text-red-500"}`}>
              {breadth.pct_above_200dma_chg >= 0 ? "+" : ""}{breadth.pct_above_200dma_chg}%
            </div>
          )}
        </div>
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5">
            {t("breadthAdRatio")} <InfoTip size={10} tip={t("breadthAdRatioTip")} />
          </div>
          <div className={`text-lg font-bold font-mono ${breadth.adv_dec_ratio == null ? "text-muted-foreground" : breadth.adv_dec_ratio > 1.2 ? "text-green-400" : breadth.adv_dec_ratio > 0.8 ? "text-yellow-400" : "text-red-400"}`}>
            {breadth.adv_dec_ratio ?? "—"}
          </div>
        </div>
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5">
            {t("breadthNhNl")} <InfoTip size={10} tip={t("breadthNhNlTip")} />
          </div>
          <div className={`text-lg font-bold font-mono ${breadth.new_highs_lows == null ? "text-muted-foreground" : breadth.new_highs_lows > 0 ? "text-green-400" : breadth.new_highs_lows < 0 ? "text-red-400" : "text-yellow-400"}`}>
            {breadth.new_highs_lows ?? "—"}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 px-3 pb-2 italic">{breadth.description}</p>
    </div>
  );
}
