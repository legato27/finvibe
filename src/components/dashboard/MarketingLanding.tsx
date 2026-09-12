"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LiveTerminal } from "@/components/dashboard/LiveTerminal";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import Stat, { type StatTone } from "@/components/ui/Stat";
import Chip from "@/components/ui/Chip";
import { macroApi } from "@/lib/api";
import { Gauge, Activity, Layers, TrendingUp, Radio, Shield, ArrowRight, CheckCircle2, Lock, Brain } from "lucide-react";
import { useTranslations } from "next-intl";

const cta = "inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-bold transition-colors";
const ctaPrimary = `${cta} bg-primary text-primary-foreground hover:opacity-90`;
const ctaGhost = `${cta} border border-border bg-card text-foreground hover:border-foreground/40`;

/**
 * The signed-out front page. The landing IS the product: the hero's terminal
 * and the stat strip read the same public regime endpoint the Today page
 * uses, sample-badged if the fetch fails so a visitor never sees a broken
 * page. Built on the same panels, chips and stats as the app.
 */
export function MarketingLanding() {
  const t = useTranslations("landingExtended");
  const { data: macro } = useQuery({
    queryKey: ["macro_dashboard"],
    queryFn: () => macroApi.dashboard(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const stats = buildStats(macro, t);

  return (
    <div className="space-y-14 pb-8 sm:space-y-20">
      {/* ── Hero ── */}
      <section className="grid grid-cols-1 items-center gap-8 pt-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-12">
        <div>
          <Chip tone="signal">{t("heroEyebrow")}</Chip>
          <h1 className="mt-5 text-4xl font-black leading-[1.02] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("heroHeadline1")}
            <span className="block text-signal">{t("heroHeadline2")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">{t("heroSubtitle")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className={ctaPrimary}>
              {t("createFreeAccount")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/login" className={ctaGhost}>{t("signIn")}</Link>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-signal-long" aria-hidden="true" />
            {t("benefit5")}
          </p>
        </div>
        <LiveTerminal data={macro} />
      </section>

      {/* ── Live stat strip ── */}
      <section aria-label={t("statRegime")} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, detail, tone }) => (
          <div key={label} className="card">
            <Stat label={label} value={value} sub={detail} tone={tone} />
          </div>
        ))}
      </section>

      {/* ── Locked depth ── */}
      <section className="space-y-6">
        <SectionHead eyebrow={t("lockedEyebrow")} title={t("lockedTitle")} intro={t("lockedDesc")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {[
            { icon: Layers, title: t("featSectorRotationTitle"), bars: [70, 45, 85, 30, 60] },
            { icon: TrendingUp, title: t("featOptionsFlowTitle"), bars: [40, 80, 55, 90, 35] },
            { icon: Brain, title: t("lockedPanelWatchlist"), bars: [65, 50, 75, 40, 88] },
          ].map(({ icon: Icon, title, bars }) => (
            <div key={title} className="card relative overflow-hidden p-0">
              <div className="select-none p-4 opacity-50 blur-[2px]" aria-hidden="true">
                <Icon className="mb-3 h-5 w-5 text-signal" />
                <div className="space-y-2">
                  {bars.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                        <div className={`h-full rounded ${i % 3 === 0 ? "bg-signal-long/70" : i % 3 === 1 ? "bg-protocol/60" : "bg-signal-short/60"}`} style={{ width: `${w}%` }} />
                      </div>
                      <div className="h-2 w-8 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card shadow-float">
                  <Lock className="h-4 w-4 text-signal" aria-hidden="true" />
                </span>
                <span className="px-3 text-center text-xs font-bold text-foreground">{title}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link href="/register" className={ctaPrimary}>
            {t("unlockCta")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── How it works: a real sequence, so the steps are numbered ── */}
      <section className="space-y-6">
        <SectionHead eyebrow={t("howItWorksEyebrow")} title={t("howItWorksTitle")} intro={t("howItWorksIntro")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { step: "01", icon: Gauge, title: t("step1Title"), desc: t("step1Desc") },
            { step: "02", icon: Shield, title: t("step2Title"), desc: t("step2Desc") },
            { step: "03", icon: Radio, title: t("step3Title"), desc: t("step3Desc") },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="card">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-control bg-signal-bg text-signal">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-mono text-[11px] tracking-[0.14em] text-dim">{step}</span>
              </div>
              <h3 className="text-base font-bold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What's inside ── */}
      <section className="space-y-6">
        <SectionHead eyebrow={t("whatsInsideEyebrow")} title={t("whatsInsideTitle")} intro={t("whatsInsideIntro")} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            { icon: Gauge, title: t("featRiskRegimeTitle"), desc: t("featRiskRegimeDesc") },
            { icon: Activity, title: t("featLiveBreadthTitle"), desc: t("featLiveBreadthDesc") },
            { icon: Layers, title: t("featSectorRotationTitle"), desc: t("featSectorRotationDesc") },
            { icon: TrendingUp, title: t("featOptionsFlowTitle"), desc: t("featOptionsFlowDesc") },
            { icon: Shield, title: t("featVixTermTitle"), desc: t("featVixTermDesc") },
            { icon: Radio, title: t("featLiveNewsTitle"), desc: t("featLiveNewsDesc") },
            { icon: Activity, title: t("featCryptoPulseTitle"), desc: t("featCryptoPulseDesc") },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card">
              <Icon className="mb-3 h-5 w-5 text-signal" aria-hidden="true" />
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="card grid grid-cols-1 items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Chip tone="signal">{t("builtForEyebrow")}</Chip>
          <h2 className="mt-4 text-2xl font-black leading-tight tracking-tight text-foreground sm:text-3xl">{t("builtForTitle")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("builtForDesc")}</p>
        </div>
        <ul className="space-y-3">
          {[t("benefit1"), t("benefit2"), t("benefit3"), t("benefit4"), t("benefit5")].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-signal-long" aria-hidden="true" />
              <span className="text-sm text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Final CTA ── */}
      <section className="card border-signal/40 bg-signal-bg p-8 text-center sm:p-14">
        <h2 className="text-2xl font-black leading-tight tracking-tight text-foreground sm:text-4xl">{t("finalCtaTitle")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">{t("finalCtaSubtitle")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/register" className={ctaPrimary}>
            {t("createFreeAccount")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/login" className={ctaGhost}>{t("signIn")}</Link>
        </div>
      </section>

      <div className="overflow-hidden rounded-panel border border-border">
        <MarketTickerTape />
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <header className="space-y-3 text-center">
      <Chip tone="signal">{eyebrow}</Chip>
      <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <p className="mx-auto max-w-2xl text-sm text-muted-foreground">{intro}</p>
    </header>
  );
}

/* ── Live stat tiles under the hero — same data as the terminal ── */
function buildStats(macro: any, t: (k: string) => string): { label: string; value: string; detail: string; tone: StatTone }[] {
  const bc = macro?.business_cycle;
  const vix = macro?.vix;
  const breadth = macro?.breadth;
  const swarm = macro?.swarm;
  const regimeState = bc?.state || "—";
  const vixVal = vix?.current;
  const above50 = breadth?.pct_above_50dma;
  const swarmScore = swarm?.swarm_score;
  return [
    {
      label: t("statRegime"),
      value: regimeState,
      detail: bc?.probabilities?.[regimeState] != null ? `P ${(bc.probabilities[regimeState] * 100).toFixed(0)}%` : "…",
      tone: regimeState === "Expansion" ? "long" : regimeState === "Contraction" ? "short" : "plain",
    },
    {
      label: "VIX",
      value: vixVal != null ? vixVal.toFixed(2) : "—",
      detail: vix?.zone_description || "…",
      tone: vixVal == null ? "plain" : vixVal < 20 ? "long" : vixVal <= 30 ? "caution" : "short",
    },
    {
      label: t("statBreadth"),
      value: above50 != null ? `${above50.toFixed(0)}%` : "—",
      detail: breadth?.description || "…",
      tone: above50 == null ? "plain" : above50 >= 60 ? "long" : above50 >= 40 ? "caution" : "short",
    },
    {
      label: t("statCrowd"),
      value: swarmScore != null ? `${Number(swarmScore).toFixed(0)}` : "—",
      detail: swarm?.signal_type ? `${swarm.signal_type}` : "…",
      tone: swarm?.signal_type === "White" ? "long" : swarm?.signal_type === "Black" ? "short" : "caution",
    },
  ];
}
