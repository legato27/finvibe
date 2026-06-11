"use client";

/**
 * Sub-tab bar shared by the three screener pages (Ranked Book, Multibagger,
 * Options Book). The navbar collapses them into one "Screeners" entry; this
 * bar is the second-level navigation, keeping the original routes intact.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListOrdered, Rocket, Coins } from "lucide-react";
import { useTranslations } from "next-intl";

export function ScreenerTabs() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");

  const tabs = [
    { href: "/ranked", label: tNav("ranked"), icon: ListOrdered },
    { href: "/multibagger", label: "Multibagger", icon: Rocket },
    { href: "/options", label: tNav("optionsBook"), icon: Coins },
  ];

  return (
    <nav aria-label={tNav("screeners")} className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
      {tabs.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            pathname === href
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:text-foreground/80"
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
