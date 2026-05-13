"use client";
import Link from "next/link";
import { LandingHero } from "@/components/dashboard/LandingHero";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import { Gauge, Activity, Layers, TrendingUp, Radio, Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function MarketingLanding() {
  const t = useTranslations("landingExtended");
  return (
    <div className="space-y-12 sm:space-y-20 pb-8">
      {/* Live ticker — shows the product is live */}
      <div className="-mx-2 sm:-mx-0 -mt-2">
        <MarketTickerTape />
      </div>

      {/* 3D Hero */}
      <LandingHero />

      {/* ── How it works ───────────────────────────────── */}
      <section className="space-y-6">
        <header className="text-center space-y-2">
          <span className="section-eyebrow">{t("howItWorksEyebrow")}</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t("howItWorksTitle")}</h2>
          <p className="section-intro mx-auto">
            {t("howItWorksIntro")}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {[
            {
              step: "01",
              icon: Gauge,
              title: t("step1Title"),
              desc: t("step1Desc"),
            },
            {
              step: "02",
              icon: Shield,
              title: t("step2Title"),
              desc: t("step2Desc"),
            },
            {
              step: "03",
              icon: Radio,
              title: t("step3Title"),
              desc: t("step3Desc"),
            },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div
              key={step}
              className="card-3d card relative overflow-hidden group"
            >
              <div className="absolute top-3 right-3 text-3xl font-bold text-primary/10 font-mono">{step}</div>
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
          <p className="section-intro mx-auto">
            {t("whatsInsideIntro")}
          </p>
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
            { icon: Layers, title: t("featOsintFeedTitle"), desc: t("featOsintFeedDesc") },
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
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 leading-tight">
              {t("builtForTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {t("builtForDesc")}
            </p>
          </div>

          <ul className="space-y-3">
            {[
              t("benefit1"),
              t("benefit2"),
              t("benefit3"),
              t("benefit4"),
              t("benefit5"),
            ].map((item) => (
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
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground leading-tight">
            {t("finalCtaTitle")}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            {t("finalCtaSubtitle")}
          </p>
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
