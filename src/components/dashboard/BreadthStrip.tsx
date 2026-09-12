"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat from "@/components/ui/Stat";
import { InfoTip } from "@/components/shared/InfoTip";

const SIGNAL_KEY_MAP: Record<string, string> = {
  broad_strength: "breadthSigBroadStrength",
  broad_weakness: "breadthSigBroadWeakness",
  narrowing: "breadthSigNarrowing",
};
const SIGNAL_PILL: Record<string, string> = {
  broad_strength: "text-signal-long bg-signal-long-bg",
  broad_weakness: "text-signal-short bg-signal-short-bg",
  narrowing: "text-signal-caution bg-signal-caution-bg",
};

const tone = (v: number | null | undefined, hi: number, lo: number) =>
  v == null ? "muted" : v > hi ? "long" : v > lo ? "caution" : "short";

export function BreadthStrip() {
  const t = useTranslations("dashboard");
  const { data: breadth, isLoading } = useQuery({
    queryKey: ["breadth"],
    queryFn: macroApi.breadth,
    staleTime: 60_000 * 5,
  });

  const label = (
    <span className="flex items-center gap-1">
      {t("breadthTitle")} <InfoTip tip={t("breadthInfo")} />
    </span>
  );
  if (isLoading) return <PanelPending label={label} text={t("loadingGeneric")} />;
  if (!breadth || breadth.error) return <PanelUnavailable label={label} reason={t("notAvailableReason")} />;

  const signalLabel = breadth.signal && SIGNAL_KEY_MAP[breadth.signal] ? t(SIGNAL_KEY_MAP[breadth.signal]) : t("breadthSigNeutral");
  const pill = SIGNAL_PILL[breadth.signal] ?? "text-muted-foreground bg-muted";
  const chg = (v: number | null | undefined) => (v == null ? undefined : `${v >= 0 ? "+" : ""}${v}% ${t("breadthVsYesterday")}`);

  return (
    <Panel
      label={label}
      qualifier={breadth.sample_size ? t("breadthSample", { n: breadth.sample_size }) : undefined}
      aside={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}>{signalLabel}</span>}
      reading={breadth.description}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label={t("breadthPctAbove50")} value={breadth.pct_above_50dma != null ? `${breadth.pct_above_50dma}%` : "—"} sub={chg(breadth.pct_above_50dma_chg)} tone={tone(breadth.pct_above_50dma, 60, 40)} />
        <Stat label={t("breadthPctAbove200")} value={breadth.pct_above_200dma != null ? `${breadth.pct_above_200dma}%` : "—"} sub={chg(breadth.pct_above_200dma_chg)} tone={tone(breadth.pct_above_200dma, 60, 40)} />
        <Stat label={t("breadthAdRatio")} value={breadth.adv_dec_ratio ?? "—"} sub={breadth.advances != null ? `${breadth.advances}▲ ${breadth.declines}▼` : undefined} tone={tone(breadth.adv_dec_ratio, 1.2, 0.8)} />
        <Stat label={t("breadthNhNl")} value={breadth.new_highs_lows ?? "—"} tone={breadth.new_highs_lows == null ? "muted" : breadth.new_highs_lows > 0 ? "long" : breadth.new_highs_lows < 0 ? "short" : "caution"} />
      </div>
    </Panel>
  );
}
