"use client";

/**
 * ScreenerFrame — the screeners hub.
 *
 * Four question cards on top, one of them current; under it the chosen
 * screener's title, freshness chip, scope picker, actions and guide, in the
 * same place on every screener. Each screener keeps its own route, so the
 * URL is the choice and deep links keep working.
 */
import Link from "next/link";
import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ListOrdered, Rocket, Coins, LayoutGrid } from "lucide-react";
import Freshness from "@/components/ui/Freshness";

export type ScreenerKey = "ranked" | "multibagger" | "options" | "heatmap";

const CARDS: { key: ScreenerKey; href: string; icon: typeof ListOrdered }[] = [
  { key: "ranked", href: "/ranked", icon: ListOrdered },
  { key: "multibagger", href: "/multibagger", icon: Rocket },
  { key: "options", href: "/options", icon: Coins },
  { key: "heatmap", href: "/heatmap", icon: LayoutGrid },
];

export function ScreenerFrame({
  active,
  title,
  subtitle,
  asOf,
  asOfLabel,
  scope,
  actions,
  guide,
  className = "max-w-[1200px]",
  children,
}: {
  active: ScreenerKey;
  title: ReactNode;
  subtitle?: ReactNode;
  asOf?: string | null;
  asOfLabel?: string;
  scope?: ReactNode;
  actions?: ReactNode;
  guide?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("screeners");
  return (
    <div className={`mx-auto space-y-4 ${className}`}>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="font-mono text-xs text-muted-foreground">{t("subtitle")}</p>
      </header>

      <nav aria-label={t("title")} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {CARDS.map(({ key, href, icon: Icon }) => {
          const on = key === active;
          return (
            <Link
              key={key}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex items-start gap-2.5 rounded-panel border px-3 py-2.5 transition-colors ${
                on ? "border-signal/50 bg-signal-bg" : "border-border bg-card hover:border-foreground/30"
              }`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? "text-signal" : "text-muted-foreground"}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className={`text-sm font-bold ${on ? "text-signal" : "text-foreground"}`}>{t(`${key}.title`)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{t(`${key}.question`)}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">{title}</h2>
              {asOf && <Freshness at={asOf} label={asOfLabel} />}
            </div>
            {subtitle && <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {(scope || actions) && (
            <div className="flex flex-wrap items-center gap-2">
              {scope}
              {actions}
            </div>
          )}
        </div>
        {guide}
      </section>

      {children}
    </div>
  );
}
