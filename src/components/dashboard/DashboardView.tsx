"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { macroApi } from "@/lib/api";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { TodaySignalsPanel } from "@/components/dashboard/TodaySignalsPanel";
import { RegimeAgreement } from "@/components/dashboard/RegimeAgreement";
import { MacroTape } from "@/components/dashboard/MacroTape";
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
  const t = useTranslations("dashboard");
  const { setVix, setBusinessCycle, setSectorRotation, setSwarm } = useAppStore();

  // NOTE: RegimeAgreement and TodayPanel observe the SAME ["macro_dashboard"]
  // query key with a bare `macroApi.dashboard` queryFn. React Query dedupes by
  // key and runs only one queryFn per fetch, so we must NOT put the store-
  // population side-effects inside this queryFn — if another observer's queryFn
  // wins the fetch, those side-effects never run and Swarm/Cycle/Rotation/VIX
  // hang on their loading state. Populate the store from `data` in an effect
  // instead, so it fires whenever the shared query resolves.
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
    <div className="space-y-5 p-2 sm:p-0">
      <div className="-mx-2 sm:-mx-0 -mt-2 sm:-mt-2">
        <MarketTickerTape />
      </div>

      {/* 1 — Today's read: arbitrated regime, risk score, positioning */}
      <Section title={t("sectionTodayTitle")} intro={t("sectionTodayIntro")}>
        <RegimeAgreement />
        <TodayPanel />
      </Section>

      {/* 2 — Risk & volatility: the options trader's read (VIX + dealer gamma).
          items-start so each card hugs its content — no forced min-heights, no
          stretch padding, no dead space. Density by content, not by box. */}
      <Section title={t("sectionRiskVolTitle")} intro={t("sectionRiskVolIntro")}>
        {/* VixGauge draws a recharts gauge that needs a real height; GexCard
            fills the matched height via flex-1, so the pair stays tidy. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-[320px]"><VixGauge /></div>
          <div className="h-[320px]"><GexCard /></div>
        </div>
      </Section>

      {/* 3 — Today's signals & changes: what flipped overnight */}
      <Section title={t("sectionSignalsTitle")} intro={t("sectionSignalsIntro")}>
        <TodaySignalsPanel />
      </Section>

      {/* 4 — Crowd & breadth: how fragile is this tape */}
      <Section title={t("sectionCrowdTitle")} intro={t("sectionCrowdIntro")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          <SwarmIndicator />
          <BreadthStrip />
          <BusinessCycleWheel />
        </div>
      </Section>

      {/* 5 — Macro tape (cross-asset sparklines) */}
      <Section title={t("sectionMovingTitle")} intro={t("sectionMovingIntro")}>
        <MacroTape />
      </Section>

      {/* 6 — Rotation & your watchlist: where the leadership is */}
      <Section title={t("sectionRotationTitle")} intro={t("sectionRotationIntro")}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          <SectorRotationHeatmap />
          <WatchlistGlance />
        </div>
      </Section>

      {/* 7 — Crypto, news & the wire: three packed columns fill the width */}
      <Section title={t("sectionWireTitle")} intro={t("sectionWireIntro")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          <CryptoIndicators />
          <RealtimeNewsFeed />
          <OsintFeed />
        </div>
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
