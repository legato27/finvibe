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

export default function DashboardPage() {
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
    <div className="space-y-3 sm:space-y-4 p-2 sm:p-0">
      {/* ── Ticker Tape ──────────────────────────────────── */}
      <div className="-mx-2 sm:-mx-0">
        <MarketTickerTape />
      </div>

      {/* ── Header ───────────────────────────────────────── */}
      <div>
        <h1 className="text-base sm:text-lg font-bold text-foreground">Market Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          Decision surface &middot; Macro &middot; Breadth &middot; GEX &middot; Cross-asset
        </p>
      </div>

      {/* ── TODAY PANEL (the decision surface) ────────────── */}
      <TodayPanel />

      {/* ── Macro Tape (cross-asset sparklines) ──────────── */}
      <MacroTape />

      {/* ── Market Overview + Watchlist ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3 sm:gap-4">
        <div className="min-h-[420px]"><MarketOverview /></div>
        <div className="min-h-[420px]"><WatchlistGlance /></div>
      </div>

      {/* ── VIX (with term structure) + GEX + Swarm ──────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="min-h-[340px]"><VixGauge /></div>
        <div className="min-h-[340px]"><GexCard /></div>
        <div className="min-h-[340px]"><SwarmIndicator /></div>
      </div>

      {/* ── Business Cycle + Sector Rotation ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="min-h-[300px]"><BusinessCycleWheel /></div>
        <div className="min-h-[300px]"><SectorRotationHeatmap /></div>
      </div>

      {/* ── Breadth Strip ────────────────────────────────── */}
      <BreadthStrip />

      {/* ── Crypto + News ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 sm:gap-4">
        <CryptoIndicators />
        <RealtimeNewsFeed />
      </div>
    </div>
  );
}
