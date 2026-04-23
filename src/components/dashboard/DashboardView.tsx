"use client";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { macroApi } from "@/lib/api";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { MacroTape } from "@/components/dashboard/MacroTape";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { WatchlistGlance } from "@/components/dashboard/WatchlistGlance";
import { VixGauge } from "@/components/dashboard/VixGauge";
import { SwarmIndicator } from "@/components/dashboard/SwarmIndicator";
import { BusinessCycleWheel } from "@/components/dashboard/BusinessCycleWheel";
import { SectorRotationHeatmap } from "@/components/dashboard/SectorRotationHeatmap";
import { CryptoIndicators } from "@/components/dashboard/CryptoIndicators";
import { GexCard } from "@/components/dashboard/GexCard";
import { BreadthStrip } from "@/components/dashboard/BreadthStrip";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import { OsintFeed } from "@/components/shared/OsintFeed";

export function DashboardView() {
  const { setVix, setBusinessCycle, setSectorRotation, setSwarm } = useAppStore();

  useQuery({
    queryKey: ["macro_dashboard"],
    queryFn: async () => {
      const data = await macroApi.dashboard();
      if (data.vix) setVix(data.vix);
      if (data.business_cycle) setBusinessCycle(data.business_cycle);
      if (data.sector_rotation) setSectorRotation(data.sector_rotation);
      if (data.swarm) setSwarm(data.swarm);
      return data;
    },
    refetchInterval: 60 * 1000,
    staleTime: 50 * 1000,
  });

  return (
    <div className="space-y-6 sm:space-y-8 p-2 sm:p-0">
      <div className="-mx-2 sm:-mx-0 -mt-2 sm:-mt-2">
        <MarketTickerTape />
      </div>

      <div>
        <h1 className="text-base sm:text-lg font-bold text-foreground">Market Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          Today&apos;s read &middot; Risk &middot; Breadth &middot; Rotation &middot; News
        </p>
      </div>

      <Section title="Today's read" intro="One-line summary of the regime.">
        <TodayPanel />
      </Section>

      <Section title="What's moving" intro="Cross-asset sparklines.">
        <MacroTape />
      </Section>

      <Section title="Markets & your watchlist" intro="Headline indices alongside what you follow.">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3 sm:gap-4">
          <div className="card-3d min-h-[420px]"><MarketOverview /></div>
          <div className="card-3d min-h-[420px]"><WatchlistGlance /></div>
        </div>
      </Section>

      <Section title="Risk radar" intro="VIX, GEX and crowd momentum.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="card-3d min-h-[340px]"><VixGauge /></div>
          <div className="card-3d min-h-[340px]"><GexCard /></div>
          <div className="card-3d min-h-[340px]"><SwarmIndicator /></div>
        </div>
      </Section>

      <Section title="Cycle & sectors" intro="Where we are and who's leading.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <div className="card-3d"><BusinessCycleWheel /></div>
          <div className="card-3d"><SectorRotationHeatmap /></div>
        </div>
      </Section>

      <Section title="Breadth" intro="Is the rally broad or narrow?">
        <BreadthStrip />
      </Section>

      <Section title="Crypto & news" intro="Sentiment and the stories driving it.">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 sm:gap-4">
          <CryptoIndicators />
          <RealtimeNewsFeed />
        </div>
      </Section>

      <Section title="On the wire" intro="Filings, regulator moves, supply-chain chatter.">
        <OsintFeed />
      </Section>
    </div>
  );
}

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 sm:space-y-3">
      <header>
        <h2 className="text-sm sm:text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{intro}</p>
      </header>
      {children}
    </section>
  );
}
