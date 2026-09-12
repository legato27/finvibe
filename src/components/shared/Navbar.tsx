"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Activity, Briefcase, Eye, ListOrdered, Landmark, LogIn, LogOut, Settings, Plug, Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "@/components/shared/ThemeProvider";
import { HeaderFreshness } from "@/components/ui/Freshness";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";

// Active when the path equals the href, sits beneath it, or matches one of the
// secondary routes that share a top-level entry. "/" matches exactly only.
function isActive(pathname: string, href: string, match?: string[]): boolean {
  const targets = match ?? [href];
  return targets.some((t) =>
    t === "/" ? pathname === "/" : pathname === t || pathname.startsWith(t + "/")
  );
}

/** The mark: a step function — discrete state changes, resolving upward. */
export function Wordmark({ className = "" }: { className?: string }) {
  const tCommon = useTranslations("common");
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="text-signal">
        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
        <path d="M7 23 L12.5 23 L12.5 16 L18 16 L18 10.5 L24 10.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" />
        <circle cx="24" cy="10.5" r="2.6" fill="currentColor" />
      </svg>
      <span className="text-[17px] leading-none tracking-tight [font-variant-ligatures:none]" aria-label={tCommon("appName")}>
        <span className="font-light text-muted-foreground">vibe</span>
        <span className="font-bold text-foreground">fin</span>
      </span>
    </span>
  );
}

const THEMES = [
  { value: "light" as const, icon: Sun, key: "themeLight" as const },
  { value: "dark" as const, icon: Moon, key: "themeDark" as const },
  { value: "auto" as const, icon: Monitor, key: "themeAuto" as const },
];

const menuItem =
  "flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm text-muted-foreground outline-none data-[highlighted]:bg-accent data-[highlighted]:text-foreground";

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

  // Five destinations. Screeners fans out to ranked / multibagger / options /
  // heatmap; Desk is a workflow, not a screener, so it stands on its own.
  const navItems: { href: string; label: string; icon: typeof Activity; public: boolean; match?: string[] }[] = [
    { href: "/", label: tNav("today"), icon: Activity, public: true },
    { href: "/ranked", label: tNav("screeners"), icon: ListOrdered, public: true, match: ["/ranked", "/multibagger", "/options", "/heatmap"] },
    { href: "/watchlist", label: tNav("watchlist"), icon: Eye, public: false },
    { href: "/portfolio", label: tNav("portfolio"), icon: Briefcase, public: false },
    { href: "/desk", label: tNav("desk"), icon: Landmark, public: true },
  ];
  const visibleItems = navItems.filter((item) => item.public || user);

  const name = user?.user_metadata?.full_name || user?.email || "";
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="container mx-auto flex h-[58px] max-w-[1600px] items-center gap-3 px-3 sm:gap-6 sm:px-4">
        <Link href="/" className="shrink-0 rounded-md">
          <Wordmark />
        </Link>

        <nav aria-label={tNav("primary")} className="flex gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {visibleItems.map(({ href, label, icon: Icon, match }) => {
            const active = isActive(pathname, href, match);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 py-1.5 text-sm transition-colors sm:px-3 ${
                  active
                    ? "bg-primary font-bold text-primary-foreground"
                    : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 md:hidden" aria-hidden="true" />
                <span className="sr-only md:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <HeaderFreshness className="hidden sm:inline-flex" />

          {user ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={tNav("account")}
                  className="grid h-8 w-8 place-items-center rounded-[9px] border border-border bg-raised font-mono text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {initials || "·"}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-[60] w-64 rounded-panel border border-border bg-card p-2 shadow-float"
                >
                  <div className="mb-1.5 border-b border-border px-2.5 pb-2.5 pt-1.5">
                    <div className="truncate text-sm font-bold text-foreground">{name}</div>
                    {user.email && name !== user.email && (
                      <div className="truncate font-mono text-[11px] text-dim">{user.email}</div>
                    )}
                  </div>
                  <DropdownMenu.Item asChild className={menuItem}>
                    <Link href="/settings"><Settings className="h-4 w-4" aria-hidden="true" />{tCommon("settings")}</Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild className={menuItem}>
                    <Link href="/settings/mcp"><Plug className="h-4 w-4" aria-hidden="true" />{tNav("connectors")}</Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
                  <DropdownMenu.Label className="px-2.5 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                    {tCommon("theme")}
                  </DropdownMenu.Label>
                  <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
                    {THEMES.map(({ value, icon: Icon, key }) => (
                      <DropdownMenu.RadioItem key={value} value={value} className={menuItem}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {tCommon(key)}
                        <DropdownMenu.ItemIndicator className="ml-auto text-signal">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                  <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
                  <DropdownMenu.Item onSelect={handleSignOut} className={menuItem}>
                    <LogOut className="h-4 w-4" aria-hidden="true" />{tCommon("signOut")}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <>
              <ThemeCycle />
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:border-foreground/40"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {tCommon("signIn")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Signed-out visitors have no account menu, so the theme cycles from a button. */
function ThemeCycle() {
  const { theme, setTheme } = useTheme();
  const tCommon = useTranslations("common");
  const current = THEMES.find((o) => o.value === theme) ?? THEMES[2];
  const Icon = current.icon;
  function cycle() {
    const i = THEMES.findIndex((o) => o.value === theme);
    setTheme(THEMES[(i + 1) % THEMES.length].value);
  }
  return (
    <button
      type="button"
      onClick={cycle}
      className="grid h-8 w-8 place-items-center rounded-[9px] border border-border text-muted-foreground transition-colors hover:text-foreground"
      title={`${tCommon("theme")}: ${tCommon(current.key)}`}
      aria-label={`${tCommon("theme")}: ${tCommon(current.key)}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
