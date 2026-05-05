"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/mcp/tokens", label: "Personal tokens" },
  { href: "/settings/mcp/oauth", label: "Connected apps" },
  { href: "/settings/mcp/guide", label: "Connection guide" },
] as const;

export function McpSubnav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border/40 mb-4">
      <nav className="flex gap-1 overflow-x-auto -mb-px">
        {TABS.map(({ href, label }) => {
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
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
