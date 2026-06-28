"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Activity, Briefcase, Eye, LogOut, LogIn, Sun, Moon, Monitor, Settings, ListOrdered, Radio } from "lucide-react";
import { useTheme } from "@/components/shared/ThemeProvider";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";

const themeOptions = [
  { value: "light" as const, icon: Sun },
  { value: "dark" as const, icon: Moon },
  { value: "auto" as const, icon: Monitor },
];

// Active when the path equals the href, sits beneath it, or matches one of the
// secondary routes that share a top-level entry (e.g. Screeners → ranked /
// multibagger / options; Intelligence → /osint/*). "/" matches exactly only.
function isActive(pathname: string, href: string, match?: string[]): boolean {
  const targets = match ?? [href];
  return targets.some((t) =>
    t === "/" ? pathname === "/" : pathname === t || pathname.startsWith(t + "/")
  );
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  function cycleTheme() {
    const order: ("light" | "dark" | "auto")[] = ["light", "dark", "auto"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % 3]);
  }

  const ThemeIcon = themeOptions.find((o) => o.value === theme)?.icon || Monitor;
  const themeLabel =
    theme === "light" ? tCommon("themeLight")
    : theme === "dark" ? tCommon("themeDark")
    : tCommon("themeAuto");

  // Primary IA: Market Dashboard · Screeners · Intelligence · Portfolios · Watchlists.
  // Screeners fans out to ranked/multibagger/options via ScreenerTabs;
  // Intelligence fans out to wire/map/timeline (+ actors/indices) under /osint.
  const navItems: { href: string; label: string; icon: typeof Activity; public: boolean; match?: string[] }[] = [
    { href: "/", label: tNav("dashboard"), icon: Activity, public: true },
    { href: "/ranked", label: tNav("screeners"), icon: ListOrdered, public: true, match: ["/ranked", "/multibagger", "/options"] },
    { href: "/osint", label: tNav("osint"), icon: Radio, public: true, match: ["/osint"] },
    { href: "/portfolio", label: tNav("portfolio"), icon: Briefcase, public: false },
    { href: "/watchlist", label: tNav("watchlist"), icon: Eye, public: false },
  ];

  const visibleItems = navItems.filter((item) => item.public || user);

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 max-w-[1600px] flex items-center h-14 gap-2 sm:gap-6">
        {/* Wordmark — terminal style */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/vibefin-icon.svg" alt="VibeFin" width={26} height={26} />
          <div className="flex flex-col leading-none">
            <span className="font-mono text-sm font-semibold lowercase tracking-tight text-foreground">
              {tCommon("appName")}
            </span>
            <span className="hidden sm:flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Market Terminal
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-success">Live</span>
              </span>
            </span>
          </div>
        </Link>

        {/* Primary nav */}
        <nav className="flex gap-0.5 sm:gap-1 overflow-x-auto">
          {visibleItems.map(({ href, label, icon: Icon, match }) => {
            const active = isActive(pathname, href, match);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={`${tCommon("theme")}: ${themeLabel}`}
          >
            <ThemeIcon className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider hidden lg:inline">{themeLabel}</span>
          </button>

          {user ? (
            <>
              <span className="font-mono text-xs text-muted-foreground hidden lg:block">
                {user.user_metadata?.full_name || user.email}
              </span>
              <Link
                href="/settings"
                className="flex items-center p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={tCommon("settings")}
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={tCommon("signOut")}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              {tCommon("signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
