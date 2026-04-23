"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Sparkles, TrendingUp, Activity, Gauge, Layers } from "lucide-react";

export function LandingHero() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  return (
    <section className="hero-section rounded-2xl border border-border bg-gradient-to-b from-card via-card to-background">
      {/* Animated depth layers */}
      <div className="hero-grid" aria-hidden />
      <div className="hero-glow" aria-hidden />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
        {/* ── Copy ───────────────────────────────────── */}
        <div className="relative z-10 flex flex-col justify-center">
          <span className="section-eyebrow self-start mb-4">
            <Sparkles className="w-3 h-3" />
            Your Daily Market Vibe Check
          </span>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
            Understand the market
            <span className="block bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--success))] to-[hsl(var(--primary))] bg-clip-text text-transparent">
              at a glance.
            </span>
          </h1>

          <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
            VibeFin turns noisy macro signals, volatility, options flow and breadth into a simple daily read —
            so you know whether to lean in, stay cautious, or sit this one out.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {signedIn ? (
              <Link
                href="/watchlist"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-primary/20"
              >
                Open my watchlist <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-primary/20"
              >
                Get started — it&apos;s free <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <a
              href="#market-pulse"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card/50 text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              See today&apos;s read
            </a>
          </div>

          {/* Feature pills */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: Gauge, label: "Risk regime" },
              { icon: Activity, label: "Live breadth" },
              { icon: Layers, label: "Sector rotation" },
              { icon: TrendingUp, label: "Options flow" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-card/60 backdrop-blur-sm text-xs text-muted-foreground"
              >
                <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3D stage ──────────────────────────────── */}
        <div className="relative h-[320px] sm:h-[380px] lg:h-[460px] hero-stage">
          {/* Rotating ring platform */}
          <div
            className="spin-ring absolute left-1/2 top-[62%] -translate-x-1/2 w-[90%] aspect-square rounded-full border-2 border-dashed border-primary/30"
            aria-hidden
          />
          <div
            className="tilt-plate absolute left-1/2 top-[60%] -translate-x-1/2 w-[70%] aspect-square rounded-full border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent"
            aria-hidden
          />

          {/* Floating cards */}
          <FloatCard
            className="float-a absolute top-[6%] left-[4%] w-[56%] sm:w-[48%]"
            tone="primary"
            label="S&P 500"
            value="+0.82%"
            sub="Trend · Bullish bias"
            trend={[2, 4, 3, 6, 5, 8, 7, 10]}
          />

          <FloatCard
            className="float-b absolute top-[22%] right-[2%] w-[52%] sm:w-[44%]"
            tone="success"
            label="VIX"
            value="14.3"
            sub="Calm · Risk-on"
            trend={[9, 7, 8, 5, 6, 4, 3, 4]}
          />

          <FloatCard
            className="float-c absolute top-[54%] left-[8%] w-[48%] sm:w-[42%]"
            tone="warning"
            label="Sector leader"
            value="Tech"
            sub="+1.4% · rotating in"
            trend={[3, 4, 3, 5, 6, 7, 8, 9]}
          />

          <FloatCard
            className="float-d absolute top-[62%] right-[6%] w-[42%] sm:w-[36%]"
            tone="neutral"
            label="Breadth"
            value="68%"
            sub="Advancers"
            trend={[5, 6, 5, 7, 6, 8, 7, 9]}
          />
        </div>
      </div>
    </section>
  );
}

// ── Inline 3D floating card ─────────────────────────────
function FloatCard({
  className,
  tone,
  label,
  value,
  sub,
  trend,
}: {
  className?: string;
  tone: "primary" | "success" | "warning" | "neutral";
  label: string;
  value: string;
  sub: string;
  trend: number[];
}) {
  const toneMap = {
    primary: "from-primary/20 to-primary/5 border-primary/30 text-primary",
    success: "from-[hsl(var(--success))]/20 to-[hsl(var(--success))]/5 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]",
    warning: "from-[hsl(var(--warning))]/20 to-[hsl(var(--warning))]/5 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]",
    neutral: "from-muted to-background border-border text-foreground",
  } as const;

  const max = Math.max(...trend);
  const min = Math.min(...trend);
  const range = Math.max(1, max - min);
  const width = 100;
  const height = 30;
  const step = width / (trend.length - 1);
  const path = trend
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");

  return (
    <div
      className={`float-card rounded-xl border bg-gradient-to-br ${toneMap[tone]} backdrop-blur-md p-3 sm:p-4 ${className || ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <span className={`text-[10px] font-mono ${toneMap[tone].split(" ").find((c) => c.startsWith("text-"))}`}>live</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 mt-2" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
