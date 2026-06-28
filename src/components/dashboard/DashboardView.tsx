"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { macroApi } from "@/lib/api";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { TodaySignalsPanel } from "@/components/dashboard/TodaySignalsPanel";
import { RegimeAgreement } from "@/components/dashboard/RegimeAgreement";
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
  const t = useTranslations("dashboard");
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
        <h1 className="text-base sm:text-lg font-bold text-foreground">{t("marketDashboard")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* 1 — Today's read: arbitrated regime, risk score, positioning */}
      <Section title={t("sectionTodayTitle")} intro={t("sectionTodayIntro")}>
        <RegimeAgreement />
        <TodayPanel />
      </Section>

      {/* 2 — Risk & volatility: the options trader's read (VIX + dealer gamma) */}
      <Section title={t("sectionRiskVolTitle")} intro={t("sectionRiskVolIntro")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
          <div className="card-3d min-h-[340px]"><VixGauge /></div>
          <div className="card-3d min-h-[340px]"><GexCard /></div>
        </div>
      </Section>

      {/* 3 — Today's signals & changes: what flipped overnight */}
      <Section title={t("sectionSignalsTitle")} intro={t("sectionSignalsIntro")}>
        <TodaySignalsPanel />
      </Section>

      {/* 4 — Crowd & breadth: how fragile is this tape */}
      <Section title={t("sectionCrowdTitle")} intro={t("sectionCrowdIntro")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
          <div className="card-3d min-h-[340px]"><SwarmIndicator /></div>
          <div className="card-3d"><BreadthStrip /></div>
          <div className="card-3d"><BusinessCycleWheel /></div>
        </div>
      </Section>

      {/* 5 — Rotation & your watchlist: where the leadership is */}
      <Section title={t("sectionRotationTitle")} intro={t("sectionRotationIntro")}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3 sm:gap-4">
          <div className="card-3d min-h-[420px]"><SectorRotationHeatmap /></div>
          <div className="card-3d min-h-[420px]"><WatchlistGlance /></div>
        </div>
      </Section>

      {/* 6 — Macro tape + broad market overview */}
      <Section title={t("sectionMovingTitle")} intro={t("sectionMovingIntro")}>
        <MacroTape />
        <div className="card-3d min-h-[420px]"><MarketOverview /></div>
      </Section>

      {/* 7 — Crypto, news & the wire: context and catalysts */}
      <Section title={t("sectionWireTitle")} intro={t("sectionWireIntro")}>
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 sm:gap-4">
          <CryptoIndicators />
          <RealtimeNewsFeed />
        </div>
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
