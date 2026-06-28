"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { InfoTip } from "@/components/shared/InfoTip";
import { Shield, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap } from "lucide-react";

const REGIME_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  green:  { color: "text-success", bg: "bg-success/10", border: "border-success/30" },
  yellow: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  orange: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  red:    { color: "text-danger", bg: "bg-danger/10", border: "border-danger/30" },
};

const STANCE_STYLE: Record<string, { color: string; icon: typeof TrendingUp }> = {
  overweight:        { color: "text-success", icon: TrendingUp },
  "slight overweight": { color: "text-success", icon: TrendingUp },
  neutral:           { color: "text-muted-foreground", icon: Minus },
  "slight underweight": { color: "text-warning", icon: TrendingDown },
  underweight:       { color: "text-danger", icon: TrendingDown },
};

const IMPACT_COLOR: Record<string, string> = {
  positive: "text-success",
  negative: "text-danger",
  neutral: "text-muted-foreground",
};

export function TodayPanel() {
  const t = useTranslations("dashboard");
  // Share the ["macro_dashboard"] cache entry with DashboardView/RegimeAgreement
  // (same payload) instead of issuing a second identical request.
  const { data: today, isLoading } = useQuery({
    queryKey: ["macro_dashboard"],
    queryFn: macroApi.dashboard,
    select: (d: any) => d.today,
    staleTime: 60_000,
  });

  if (isLoading || !today || today.error) {
    return (
      <div className="card flex items-center justify-center py-8">
        <div className="text-muted-foreground text-sm animate-pulse">{t("buildingTodayView")}</div>
      </div>
    );
  }

  const rs = REGIME_STYLE[today.regime_color] || REGIME_STYLE.yellow;
  const score = today.risk_score;
  const normalized = Math.max(0, Math.min(100, (score + 100) / 2));

  return (
    <div className={`rounded-xl border ${rs.border} ${rs.bg} p-4 sm:p-5 space-y-4`}>
      {/* ── Header: Regime + Score ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className={`w-6 h-6 ${rs.color}`} />
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("today")} &middot; {today.date}
            </div>
            <div className={`text-xl font-black ${rs.color}`}>
              {today.regime}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
            {t("riskScore")} <InfoTip size={10} tip={t("riskScoreTip")} />
          </div>
          <div className={`text-3xl font-black font-mono ${rs.color}`}>
            {score > 0 ? "+" : ""}{score.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/30 z-10" />
        <div className="absolute top-0 bottom-0 bg-gradient-to-r from-danger via-warning to-success opacity-20 w-full" />
        <div
          className="absolute top-0 h-full w-3 rounded-full bg-white shadow-lg shadow-white/30 transition-all duration-700"
          style={{ left: `calc(${normalized}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground font-mono -mt-1">
        <span>{t("riskOff")}</span>
        <span>{t("neutral")}</span>
        <span>{t("riskOn")}</span>
      </div>

      {/* ── Score breakdown ── */}
      <div className="flex gap-1.5 flex-wrap">
        {Object.entries(today.score_components || {}).map(([key, val]) => {
          const v = val as number;
          const label = key.replace(/_/g, " ").replace("vix term", "VIX term").replace("vix", "VIX");
          return (
            <span
              key={key}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                v > 5 ? "text-success border-success/30 bg-success/5" :
                v < -5 ? "text-danger border-danger/30 bg-danger/5" :
                "text-muted-foreground border-border bg-muted/30"
              }`}
            >
              {label} {v > 0 ? "+" : ""}{v}
            </span>
          );
        })}
      </div>

      {/* ── Two columns: Positioning + Signals ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Positioning */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" /> {t("positioning")}
            <InfoTip size={10} tip={t("positioningTip")} />
          </div>
          <div className="space-y-1">
            {(today.positioning || []).map((p: any) => {
              const st = STANCE_STYLE[p.stance] || STANCE_STYLE.neutral;
              const Icon = st.icon;
              return (
                <div key={p.asset} className="flex items-center gap-2 py-0.5">
                  <Icon className={`w-3 h-3 flex-shrink-0 ${st.color}`} />
                  <span className="text-xs text-foreground flex-1">{p.asset}</span>
                  <span className={`text-[10px] font-mono font-medium ${st.color}`}>
                    {p.stance}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Key signals */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {t("keySignals")}
            <InfoTip size={10} tip={t("keySignalsTip")} />
          </div>
          <div className="space-y-1.5">
            {(today.signals || []).map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                  s.impact === "positive" ? "bg-success" :
                  s.impact === "negative" ? "bg-danger" : "bg-muted"
                }`} />
                <div className="flex-1">
                  <span className={`text-xs ${IMPACT_COLOR[s.impact] || "text-muted-foreground"}`}>
                    {s.signal}
                  </span>
                  {s.weight === "high" && (
                    <span className="text-[9px] ml-1 text-warning">{t("high")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
