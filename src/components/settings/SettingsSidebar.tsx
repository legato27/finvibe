"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Shield,
  Clock,
  DollarSign,
  Plug,
  ChevronLeft,
} from "lucide-react";

const NAV = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/security", label: "Security", icon: Shield },
  { href: "/settings/login-history", label: "Login history", icon: Clock },
  { href: "/settings/currency", label: "Currency", icon: DollarSign },
  { href: "/settings/mcp", label: "MCP & connections", icon: Plug },
] as const;

export function SettingsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-full md:w-56 md:flex-shrink-0">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </Link>
      <h1 className="text-lg font-semibold text-foreground mb-4">Settings</h1>
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {NAV.map(({ href, label, icon: Icon }) => {
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
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
