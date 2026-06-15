"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  User,
  Shield,
  Clock,
  DollarSign,
  Plug,
  Activity,
  ChevronLeft,
} from "lucide-react";

const NAV = [
  { href: "/settings/profile", labelKey: "profile", icon: User },
  { href: "/settings/security", labelKey: "security", icon: Shield },
  { href: "/settings/login-history", labelKey: "loginHistory", icon: Clock },
  { href: "/settings/currency", labelKey: "currency", icon: DollarSign },
  { href: "/settings/mcp", labelKey: "mcp", icon: Plug },
  { href: "/settings/job-runs", labelKey: "jobRuns", icon: Activity },
] as const;

export function SettingsSidebar() {
  const t = useTranslations("settings");
  const pathname = usePathname();
  return (
    <aside className="w-full md:w-56 md:flex-shrink-0">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> {t("back")}
      </Link>
      <h1 className="text-lg font-semibold text-foreground mb-4">{t("title")}</h1>
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {NAV.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                active
                  ? "bg-primary/15 border border-primary/40 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
