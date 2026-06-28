"use client";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

/* ── Split-screen auth layout: terminal-brand panel (left) + form (right).
     The brand panel is intentionally dark in both themes — it's the product's
     terminal identity; the form side follows the active theme. ── */

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const tl = useTranslations("landingExtended");

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ── */}
      <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 bg-[hsl(222,47%,6%)] text-[hsl(213,31%,91%)] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(212 100% 55% / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(212 100% 55% / 0.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
          aria-hidden
        />
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[hsl(212,100%,55%)]/15 blur-3xl"
          aria-hidden
        />

        <Link href="/" className="relative inline-flex w-fit">
          <Image src="/vibefin-logo-dark.svg" alt="VibeFin" width={170} height={68} priority />
        </Link>

        <div className="relative space-y-8 max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight">{t("tagline")}</h2>

          {/* Mini terminal sample */}
          <div className="rounded-xl border border-[hsl(217,33%,17%)] bg-[hsl(222,47%,9%)] overflow-hidden shadow-2xl">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[hsl(217,33%,17%)]">
              <span className="w-2 h-2 rounded-full bg-danger/60" aria-hidden />
              <span className="w-2 h-2 rounded-full bg-warning/60" aria-hidden />
              <span className="w-2 h-2 rounded-full bg-success/60" aria-hidden />
              <span className="flex-1 text-center font-mono text-[10px] text-[hsl(215,20%,55%)]">
                vibefin · market pulse
              </span>
            </div>
            <div className="p-4 font-mono text-[11px] space-y-1.5">
              <div className="text-[hsl(215,20%,55%)]">
                <span className="text-[hsl(212,100%,55%)]">$</span> vibefin pulse --today
              </div>
              <div>
                <span className="text-[hsl(215,20%,55%)]">REGIME&nbsp;&nbsp;&nbsp;</span>
                <span className="text-[hsl(142,69%,58%)]">Risk-on · lean in</span>
              </div>
              <div>
                <span className="text-[hsl(215,20%,55%)]">VIX&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                <span className="text-[hsl(142,69%,58%)]">14.3 ▼ calm</span>
              </div>
              <div>
                <span className="text-[hsl(215,20%,55%)]">BREADTH&nbsp;&nbsp;</span>
                <span className="text-[hsl(43,96%,56%)]">68% above 50-DMA</span>
              </div>
              <div className="text-[hsl(215,20%,55%)]">
                <span className="text-[hsl(212,100%,55%)]">$</span>
                <span className="term-cursor inline-block w-[6px] h-[11px] ml-1 align-middle bg-[hsl(212,100%,55%)]/80" aria-hidden />
              </div>
            </div>
          </div>

          <ul className="space-y-2.5">
            {[tl("benefit1"), tl("benefit2"), tl("benefit5")].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-[hsl(215,20%,70%)]">
                <CheckCircle2 className="w-4 h-4 text-[hsl(142,69%,58%)] flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-[hsl(215,20%,45%)]">© {new Date().getFullYear()} VibeFin · fin.vibelife.sg</p>
      </aside>

      {/* ── Form side ── */}
      <main className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo — theme-aware */}
          <Link href="/" className="lg:hidden flex justify-center mb-8">
            <Image src="/vibefin-logo.svg" alt="VibeFin" width={170} height={68} priority className="dark:hidden" />
            <Image src="/vibefin-logo-dark.svg" alt="VibeFin" width={170} height={68} priority className="hidden dark:block" />
          </Link>

          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}

          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

export const authInputClass =
  "w-full px-3.5 py-2.5 bg-card border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring transition-shadow";

export const authLabelClass = "block text-xs font-medium text-muted-foreground mb-1.5";
