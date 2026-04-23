"use client";
import Link from "next/link";
import { LandingHero } from "@/components/dashboard/LandingHero";
import { MarketTickerTape } from "@/components/dashboard/MarketTickerTape";
import { Gauge, Activity, Layers, TrendingUp, Radio, Shield, ArrowRight, CheckCircle2 } from "lucide-react";

export function MarketingLanding() {
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
          <span className="section-eyebrow">How it works</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Three reads, one coffee.</h2>
          <p className="section-intro mx-auto">
            Open VibeFin in the morning and you&apos;ll know the regime, the risk, and what&apos;s worth watching — in under a minute.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {[
            {
              step: "01",
              icon: Gauge,
              title: "Read the regime",
              desc: "Green, yellow, orange or red. A plain-English call on whether to lean in or step back, backed by macro + vol + breadth.",
            },
            {
              step: "02",
              icon: Shield,
              title: "Check the risk",
              desc: "VIX for pricing fear, GEX for dealer positioning, and a swarm indicator for crowd momentum — all in one glance.",
            },
            {
              step: "03",
              icon: Radio,
              title: "Follow what matters",
              desc: "Your watchlist, sector leaders, live news and OSINT signals — no scrolling twelve tabs to find the why.",
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
          <span className="section-eyebrow">What&apos;s inside</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Every signal worth watching.</h2>
          <p className="section-intro mx-auto">
            Institutional-grade data, rewritten for humans. No Bloomberg terminal required.
          </p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Gauge, title: "Risk regime", desc: "Daily green/yellow/red score across macro, vol and breadth." },
            { icon: Activity, title: "Live breadth", desc: "Advancers, decliners, new highs — is the rally real?" },
            { icon: Layers, title: "Sector rotation", desc: "Who's leading, who's lagging, and where money is flowing." },
            { icon: TrendingUp, title: "Options flow", desc: "GEX, put/call, and dealer positioning at a glance." },
            { icon: Shield, title: "VIX & term", desc: "Fear pricing plus the forward curve shape." },
            { icon: Radio, title: "Live news", desc: "Real-time headlines tagged and ranked by market impact." },
            { icon: Activity, title: "Crypto pulse", desc: "Fear & greed, BTC dominance, ETH/BTC — the risk-on read." },
            { icon: Layers, title: "OSINT feed", desc: "Filings, regulator moves, and supply-chain chatter." },
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
            <span className="section-eyebrow">Built for</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 leading-tight">
              Self-directed investors who want signal, not noise.
            </h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              If you manage your own portfolio and spend the first twenty minutes of every day stitching together CNBC,
              Twitter, Bloomberg snippets and five chart tabs — VibeFin collapses that into one view.
            </p>
          </div>

          <ul className="space-y-3">
            {[
              "Understand the market regime without parsing 20 charts",
              "Spot risk building up before it shows up in your P&L",
              "Track your watchlist against the macro picture side-by-side",
              "Get the why behind the moves — live news + OSINT",
              "Mobile-friendly: the same read on your phone at the café",
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
            Your daily market vibe check.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            Free to start. No credit card. Sign up in 30 seconds and see today&apos;s read.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-primary/30"
            >
              Create free account <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card/70 backdrop-blur text-foreground text-sm font-semibold hover:bg-accent transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
