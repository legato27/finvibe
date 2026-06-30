"use client";

/**
 * Sub-tab bar shared by the three screener pages. The navbar collapses them
 * into one "Screeners" entry; this bar is the second-level navigation.
 *
 * Labels are task-based ("what would I come here to do") rather than the
 * internal product names, with a one-line "when to use" caption, so a
 * first-time user can pick the right tool without reading a guide.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListOrdered, Rocket, Coins } from "lucide-react";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/ranked", label: "Rank my watchlist", caption: "Score the names you follow", icon: ListOrdered },
  { href: "/multibagger", label: "Find multibaggers", caption: "Hunt the whole market", icon: Rocket },
  { href: "/options", label: "Sell options", caption: "Premium-income setups", icon: Coins },
];

export function ScreenerTabs() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");

  return (
    <nav
      aria-label={tNav("screeners")}
      className="grid grid-cols-1 sm:grid-cols-3 gap-2"
    >
      {TABS.map(({ href, label, caption, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
              active
                ? "bg-primary/10 border-primary/40"
                : "bg-card border-border hover:border-primary/30 hover:bg-accent"
            }`}
          >
            <Icon
              className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
            />
            <span className="flex flex-col leading-tight">
              <span className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                {label}
              </span>
              <span className="text-[11px] text-muted-foreground">{caption}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
