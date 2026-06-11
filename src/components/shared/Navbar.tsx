"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { BarChart2, Briefcase, BookOpen, LogOut, LogIn, Sun, Moon, Monitor, DollarSign, Settings, ListOrdered } from "lucide-react";
import { useTheme } from "@/components/shared/ThemeProvider";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";

const themeOptions = [
  { value: "light" as const, icon: Sun },
  { value: "dark" as const, icon: Moon },
  { value: "auto" as const, icon: Monitor },
];

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

  const navItems: { href: string; label: string; icon: typeof BarChart2; public: boolean; match?: string[] }[] = [
    { href: "/", label: tNav("dashboard"), icon: BarChart2, public: true },
    { href: "/watchlist", label: tNav("watchlist"), icon: BookOpen, public: false },
    // Ranked Book / Multibagger / Options Book share one entry; the
    // ScreenerTabs bar on those pages is the second-level navigation.
    { href: "/ranked", label: tNav("screeners"), icon: ListOrdered, public: true, match: ["/ranked", "/multibagger", "/options"] },
    { href: "/portfolio", label: tNav("portfolio"), icon: Briefcase, public: false },
    { href: "/trades", label: tNav("trades"), icon: DollarSign, public: false },
  ];

  const visibleItems = navItems.filter((item) => item.public || user);

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 max-w-[1600px] flex items-center h-14 gap-2 sm:gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/vibefin-icon.svg" alt="VibeFin" width={28} height={28} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">{tCommon("appName")}</span>
            <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{tCommon("tagline")}</span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex gap-1">
          {visibleItems.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                (match ?? [href]).includes(pathname)
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {/* Language toggle */}
          <LanguageSwitcher />

          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={`${tCommon("theme")}: ${themeLabel}`}
          >
            <ThemeIcon className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider hidden sm:inline">{themeLabel}</span>
          </button>

          {user ? (
            <>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {user.user_metadata?.full_name || user.email}
              </span>
              <Link
                href="/settings"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={tCommon("settings")}
              >
                <Settings className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={tCommon("signOut")}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors"
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
