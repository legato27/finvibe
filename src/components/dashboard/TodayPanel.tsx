"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { InfoTip } from "@/components/shared/InfoTip";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Zap } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";

const REGIME_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  green:  { color: "text-signal-long", bg: "bg-signal-long/10", border: "border-signal-long/30" },
  yellow: { color: "text-signal-caution", bg: "bg-signal-caution/10", border: "border-signal-caution/30" },
  orange: { color: "text-signal-caution", bg: "bg-signal-caution/10", border: "border-signal-caution/30" },
  red:    { color: "text-signal-short", bg: "bg-signal-short/10", border: "border-signal-short/30" },
};

const STANCE_STYLE: Record<string, { color: string; icon: typeof TrendingUp }> = {
  overweight:        { color: "text-signal-long", icon: TrendingUp },
  "slight overweight": { color: "text-signal-long", icon: TrendingUp },
  neutral:           { color: "text-muted-foreground", icon: Minus },
  "slight underweight": { color: "text-signal-caution", icon: TrendingDown },
  underweight:       { color: "text-signal-short", icon: TrendingDown },
};

const IMPACT_COLOR: Record<string, string> = {
  positive: "text-signal-long",
  negative: "text-signal-short",
  neutral: "text-muted-foreground",
};

// Shared by the scored chips and the missing-input chips, so a component that
// drops out keeps the name it had when it was counted.
const componentLabel = (key: string) =>
  key.replace(/_/g, " ").replace("vix term", "VIX term").replace("vix", "VIX");

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

  const label = t("todayPanelTitle");
  if (isLoading) return <PanelPending label={label} text={t("buildingTodayView")} className="h-full" />;
  if (!today || today.error) return <PanelUnavailable label={label} reason={t("notAvailableReason")} className="h-full" />;

  const rs = REGIME_STYLE[today.regime_color] || REGIME_STYLE.yellow;
  const score = today.risk_score;
  const normalized = Math.max(0, Math.min(100, (score + 100) / 2));
  // A component whose input was not cached when the panel was built is left OUT
  // of score_components rather than scored as a neutral 0 — `inputs_missing`
  // names it. Rendering it as an absent chip is the whole point: without this
  // the panel shows a partial score that looks exactly like a complete one, and
  // the panel caches for 30 minutes, so that reading can stand for half an hour.
  const missingInputs: string[] = Array.isArray(today.inputs_missing) ? today.inputs_missing : [];

  return (
    <Panel
      label={label}
      qualifier={today.date}
      aside={
        <span className={`nums font-mono text-lg font-bold ${rs.color}`} title={t("riskScoreTip")}>
          {score > 0 ? "+" : ""}{score.toFixed(0)}
        </span>
      }
      className="h-full"
      bodyClassName="space-y-4"
    >
      {/* Score bar */}
      <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/30 z-10" />
        <div className="absolute top-0 bottom-0 bg-gradient-to-r from-signal-short via-signal-caution to-signal-long opacity-20 w-full" />
        <div
          className="absolute top-0 h-full w-3 rounded-full bg-foreground shadow-lg transition-all duration-700"
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
          return (
            <span
              key={key}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                v > 5 ? "text-signal-long border-signal-long/30 bg-signal-long/5" :
                v < -5 ? "text-signal-short border-signal-short/30 bg-signal-short/5" :
                "text-muted-foreground border-border bg-muted/30"
              }`}
            >
              {componentLabel(key)} {v > 0 ? "+" : ""}{v}
            </span>
          );
        })}
        {missingInputs.map((key) => (
          <span
            key={key}
            className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-signal-caution/40 bg-signal-caution/5 text-signal-caution font-mono"
          >
            {componentLabel(key)} {t("inputMissing")}
          </span>
        ))}
      </div>
      {missingInputs.length > 0 && (
        <div className="flex items-start gap-1.5 -mt-2 text-[10px] text-signal-caution/90">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
          <span>{t("inputsMissingNote", { count: missingInputs.length })}</span>
        </div>
      )}

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
                  s.impact === "positive" ? "bg-signal-long" :
                  s.impact === "negative" ? "bg-signal-short" : "bg-muted"
                }`} />
                <div className="flex-1">
                  <span className={`text-xs ${IMPACT_COLOR[s.impact] || "text-muted-foreground"}`}>
                    {s.signal}
                  </span>
                  {s.weight === "high" && (
                    <span className="text-[9px] ml-1 text-signal-caution">{t("high")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
