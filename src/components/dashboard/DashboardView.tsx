"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { macroApi } from "@/lib/api";
import { TodayCall } from "@/components/dashboard/TodayCall";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { BreadthStrip } from "@/components/dashboard/BreadthStrip";
import { VixGauge } from "@/components/dashboard/VixGauge";
import { GexCard } from "@/components/dashboard/GexCard";
import { BusinessCycleWheel } from "@/components/dashboard/BusinessCycleWheel";
import { SwarmIndicator } from "@/components/dashboard/SwarmIndicator";
import { MacroTape } from "@/components/dashboard/MacroTape";
import { TodaySignalsPanel } from "@/components/dashboard/TodaySignalsPanel";
import { WatchlistGlance } from "@/components/dashboard/WatchlistGlance";
import { SectorHeatmapCard } from "@/components/dashboard/SectorHeatmapCard";
import { SectorRotationHeatmap } from "@/components/dashboard/SectorRotationHeatmap";
import { CryptoIndicators } from "@/components/dashboard/CryptoIndicators";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";

/**
 * Today. The call strip first; everything under it is evidence, in the
 * order a reader would ask for it: regime and positioning, then vol, then
 * crowd and macro, then what fired and your own list, then rotation, then
 * the wire. No card returns null — a panel with no data keeps its place
 * and says why, so the page has the same shape on a bad-data day.
 */
export function DashboardView() {
  const t = useTranslations("dashboard");
  const { setVix, setBusinessCycle, setSectorRotation, setSwarm } = useAppStore();

  // NOTE: TodayCall and TodayPanel observe the SAME ["macro_dashboard"] query
  // key. React Query dedupes by key and runs only one queryFn per fetch, so
  // the store-population side-effects live in an effect on `data`, not in a
  // queryFn that might not be the one that runs.
  const { data } = useQuery({
    queryKey: ["macro_dashboard"],
    queryFn: macroApi.dashboard,
    refetchInterval: 60 * 1000,
    staleTime: 50 * 1000,
  });

  useEffect(() => {
    if (!data) return;
    if (data.vix) setVix(data.vix);
    if (data.business_cycle) setBusinessCycle(data.business_cycle);
    if (data.sector_rotation) setSectorRotation(data.sector_rotation);
    if (data.swarm) setSwarm(data.swarm);
  }, [data, setVix, setBusinessCycle, setSectorRotation, setSwarm]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("pageTitle")}</h1>
        <p className="font-mono text-xs text-muted-foreground">{t("pageSubtitle")}</p>
      </header>

      <TodayCall />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><TodayPanel /></div>
        <BreadthStrip />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <VixGauge />
        <GexCard />
        <BusinessCycleWheel />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SwarmIndicator />
        <div className="lg:col-span-2"><MacroTape /></div>
      </div>

      <div id="signals" className="grid scroll-mt-20 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><TodaySignalsPanel /></div>
        <WatchlistGlance />
      </div>

      <SectorHeatmapCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><SectorRotationHeatmap /></div>
        <CryptoIndicators />
      </div>

      <RealtimeNewsFeed />

      {/* The one surface not in our skin: TradingView's tape, kept for the
          affiliate link, at the bottom where it cannot dilute the call. */}
      <div className="overflow-hidden rounded-panel border border-border">
        <MarketTickerTape />
      </div>
    </div>
  );
}
