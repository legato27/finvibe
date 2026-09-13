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
import { YourBookCard } from "@/components/dashboard/YourBookCard";
import { ThisWeekPanel } from "@/components/dashboard/ThisWeekPanel";
import { SectorHeatmapCard } from "@/components/dashboard/SectorHeatmapCard";
import { SectorRotationHeatmap } from "@/components/dashboard/SectorRotationHeatmap";
import { CryptoIndicators } from "@/components/dashboard/CryptoIndicators";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";

/**
 * Today. The call strip first, full width. Under it the stock page's frame:
 * the market on the left (regime and positioning, vol, crowd and macro,
 * sectors, rotation, crypto) and the reader's own things on the right (the
 * week ahead, their book, their list, what fired, the wire). On a phone the
 * right column comes first, because "what matters to me" reads before "what
 * the market did". No card returns null — a panel with no data keeps its
 * place and says why, so the page has the same shape on a bad-data day.
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

      {/* items-start at every width: several aside cards are h-full, and a
          stretched grid row would hand them the row's height instead of
          their own. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* ── Right: you and the clock. First in the DOM so a phone reads it
               straight after the call; pinned to the second column on a desk. ── */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[104px] lg:col-start-2 lg:row-start-1">
          <ThisWeekPanel />
          <YourBookCard />
          <WatchlistGlance />
          <div id="signals" className="scroll-mt-24">
            <TodaySignalsPanel />
          </div>
          <RealtimeNewsFeed />
        </aside>

        {/* ── Left: the market ── */}
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2"><TodayPanel /></div>
            <BreadthStrip />
          </div>

          {/* Two abreast, not three: the column is 880px wide on a desk and
              the VIX gauge and the cycle wheel each need ~400px to keep
              their side figures unclipped. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <VixGauge />
            <GexCard />
            <BusinessCycleWheel />
            <SwarmIndicator />
          </div>

          <MacroTape />

          <SectorHeatmapCard />

          <SectorRotationHeatmap />

          <CryptoIndicators />
        </div>
      </div>

      {/* The one surface not in our skin: TradingView's tape, kept for the
          affiliate link, at the bottom where it cannot dilute the call. */}
      <div className="overflow-hidden rounded-panel border border-border">
        <MarketTickerTape />
      </div>
    </div>
  );
}
