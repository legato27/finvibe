"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/settings/mcp/tokens", labelKey: "tokens" },
  { href: "/settings/mcp/oauth", labelKey: "connectedApps" },
  { href: "/settings/mcp/guide", labelKey: "guide" },
] as const;

export function McpSubnav() {
  const t = useTranslations("settings.tab");
  const pathname = usePathname();
  return (
    <div className="border-b border-border/40 mb-4">
      <nav className="flex gap-1 overflow-x-auto -mb-px">
        {TABS.map(({ href, labelKey }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
