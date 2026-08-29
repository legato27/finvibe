"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LiveTerminal } from "@/components/dashboard/LiveTerminal";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import { macroApi } from "@/lib/api";
import {
  Gauge,
  Activity,
  Layers,
  TrendingUp,
  Radio,
  Shield,
  ArrowRight,
  CheckCircle2,
  Lock,
  Sparkles,
  Brain,
} from "lucide-react";
import { useTranslations } from "next-intl";

export function MarketingLanding() {
  const t = useTranslations("landingExtended");

  // Live macro pulse — same public endpoint the dashboard uses. The landing
  // IS the product: real regime/VIX/breadth in the hero, sample-badged if the
  // fetch fails so anonymous visitors never see a broken page.
  const { data: macro } = useQuery({
    queryKey: ["macro_dashboard"],
    queryFn: () => macroApi.dashboard(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const stats = buildStats(macro, t);

  return (
    <div className="space-y-12 sm:space-y-20 pb-8">
      {/* Live ticker — shows the product is live */}
      <div className="-mx-2 sm:-mx-0 -mt-2">
        <MarketTickerTape />
      </div>

      {/* ── Hero: copy + live terminal ───────────────────── */}
      <section className="hero-section rounded-2xl border border-border bg-gradient-to-b from-card via-card to-background">
        <div className="hero-grid" aria-hidden />
        <div className="hero-glow" aria-hidden />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16 items-center">
          <div className="relative z-10">
            <span className="section-eyebrow inline-flex items-center gap-1.5 mb-4">
              <Sparkles className="w-3 h-3" />
              {t("heroEyebrow")}
            </span>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
              {t("heroHeadline1")}
              <span className="block bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--success))] to-[hsl(var(--primary))] bg-clip-text text-transparent">
                {t("heroHeadline2")}
              </span>
            </h1>

            <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
              {t("heroSubtitle")}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-primary/30"
              >
                {t("createFreeAccount")} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card/70 backdrop-blur text-foreground text-sm font-semibold hover:bg-accent transition-colors"
              >
                {t("signIn")}
              </Link>
            </div>

            <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
              {t("benefit5")}
            </p>
          </div>

          <div className="relative z-10">
            <LiveTerminal data={macro} />
          </div>
        </div>
      </section>

      {/* ── Live stat strip ──────────────────────────────── */}
      <section aria-label={t("statRegime")} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(({ label, value, detail, tone }) => (
          <div key={label} className="card-3d rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
            <div className={`font-mono text-lg font-bold ${tone}`}>{value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{detail}</div>
          </div>
        ))}
      </section>

      {/* ── Locked depth panels ──────────────────────────── */}
      <section className="space-y-6">
        <header className="text-center space-y-2">
          <span className="section-eyebrow">{t("lockedEyebrow")}</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t("lockedTitle")}</h2>
          <p className="section-intro mx-auto">{t("lockedDesc")}</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Layers, title: t("featSectorRotationTitle"), bars: [70, 45, 85, 30, 60] },
            { icon: TrendingUp, title: t("featOptionsFlowTitle"), bars: [40, 80, 55, 90, 35] },
            { icon: Brain, title: t("lockedPanelWatchlist"), bars: [65, 50, 75, 40, 88] },
          ].map(({ icon: Icon, title, bars }) => (
            <div key={title} className="relative rounded-xl border border-border bg-card overflow-hidden group">
              <div className="p-4 blur-[3px] opacity-60 select-none pointer-events-none" aria-hidden>
                <Icon className="w-5 h-5 text-primary mb-3" />
                <div className="space-y-2">
                  {bars.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 rounded bg-muted flex-1 overflow-hidden">
                        <div
                          className={`h-full rounded ${i % 3 === 0 ? "bg-signal-long/60" : i % 3 === 1 ? "bg-primary/50" : "bg-signal-short/50"}`}
                          style={{ width: `${w}%` }}
                        />
                      </div>
                      <div className="w-8 h-2 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/30">
                <span className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center shadow-lg">
                  <Lock className="w-4 h-4 text-primary" />
                </span>
                <span className="text-xs font-semibold text-foreground text-center px-3">{title}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-primary/30"
          >
            {t("unlockCta")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────── */}
      <section className="space-y-6">
        <header className="text-center space-y-2">
          <span className="section-eyebrow">{t("howItWorksEyebrow")}</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t("howItWorksTitle")}</h2>
          <p className="section-intro mx-auto">{t("howItWorksIntro")}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {[
            { step: "01", icon: Gauge, title: t("step1Title"), desc: t("step1Desc") },
            { step: "02", icon: Shield, title: t("step2Title"), desc: t("step2Desc") },
            { step: "03", icon: Radio, title: t("step3Title"), desc: t("step3Desc") },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="card-3d card relative overflow-hidden group">
              <div aria-hidden="true" className="absolute top-3 right-3 text-3xl font-bold text-primary/10 font-mono">
                {step}
              </div>
              <div className="relative w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature strip ───────────────────────────────── */}
      <section className="space-y-6">
        <header className="text-center space-y-2">
          <span className="section-eyebrow">{t("whatsInsideEyebrow")}</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t("whatsInsideTitle")}</h2>
          <p className="section-intro mx-auto">{t("whatsInsideIntro")}</p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Gauge, title: t("featRiskRegimeTitle"), desc: t("featRiskRegimeDesc") },
            { icon: Activity, title: t("featLiveBreadthTitle"), desc: t("featLiveBreadthDesc") },
            { icon: Layers, title: t("featSectorRotationTitle"), desc: t("featSectorRotationDesc") },
            { icon: TrendingUp, title: t("featOptionsFlowTitle"), desc: t("featOptionsFlowDesc") },
            { icon: Shield, title: t("featVixTermTitle"), desc: t("featVixTermDesc") },
            { icon: Radio, title: t("featLiveNewsTitle"), desc: t("featLiveNewsDesc") },
            { icon: Activity, title: t("featCryptoPulseTitle"), desc: t("featCryptoPulseDesc") },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-3d p-4 rounded-xl border border-border bg-card">
              <Icon className="w-5 h-5 text-primary mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who it's for ───────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-background p-6 sm:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 items-center">
          <div>
            <span className="section-eyebrow">{t("builtForEyebrow")}</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 leading-tight">{t("builtForTitle")}</h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{t("builtForDesc")}</p>
          </div>

          <ul className="space-y-3">
            {[t("benefit1"), t("benefit2"), t("benefit3"), t("benefit4"), t("benefit5")].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-[hsl(var(--success))]/10 p-8 sm:p-14 text-center">
        <div className="hero-glow opacity-60" aria-hidden />
        <div className="relative">
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground leading-tight">{t("finalCtaTitle")}</h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">{t("finalCtaSubtitle")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-primary/30"
            >
              {t("createFreeAccount")} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card/70 backdrop-blur text-foreground text-sm font-semibold hover:bg-accent transition-colors"
            >
              {t("signIn")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Live stat tiles under the hero — same data as the terminal ── */
function buildStats(macro: any, t: (k: string) => string) {
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
      tone:
        regimeState === "Expansion"
          ? "text-signal-long"
          : regimeState === "Contraction"
          ? "text-signal-short"
          : "text-foreground",
    },
    {
      label: "VIX",
      value: vixVal != null ? vixVal.toFixed(2) : "—",
      detail: vix?.zone_description || "…",
      tone: vixVal == null ? "text-foreground" : vixVal < 20 ? "text-signal-long" : vixVal <= 30 ? "text-signal-caution" : "text-signal-short",
    },
    {
      label: t("statBreadth"),
      value: above50 != null ? `${above50.toFixed(0)}%` : "—",
      detail: breadth?.description || "…",
      tone: above50 == null ? "text-foreground" : above50 >= 60 ? "text-signal-long" : above50 >= 40 ? "text-signal-caution" : "text-signal-short",
    },
    {
      label: t("statCrowd"),
      value: swarmScore != null ? `${Number(swarmScore).toFixed(0)}` : "—",
      detail: swarm?.signal_type ? `${swarm.signal_type}` : "…",
      tone:
        swarm?.signal_type === "Green"
          ? "text-signal-long"
          : swarm?.signal_type === "Red"
          ? "text-signal-short"
          : "text-signal-caution",
    },
  ];
}
