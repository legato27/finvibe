"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { BarChart2, Briefcase, BookOpen, LogOut, LogIn, Sun, Moon, Monitor, TrendingUp, DollarSign } from "lucide-react";
import { useTheme } from "@/components/shared/ThemeProvider";
import type { User } from "@supabase/supabase-js";

const themeOptions = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "auto" as const, icon: Monitor, label: "Auto" },
];

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();

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

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart2, public: true },
    { href: "/watchlist", label: "Watchlists", icon: BookOpen, public: false },
    { href: "/portfolio", label: "Portfolio", icon: Briefcase, public: false },
    { href: "/trades", label: "Trades", icon: DollarSign, public: false },
    { href: "/polyedge", label: "PolyEdge", icon: TrendingUp, public: true },
  ];

  const visibleItems = navItems.filter((item) => item.public || user);

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 max-w-[1600px] flex items-center h-14 gap-2 sm:gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/vibefin-icon.svg" alt="VibeFin" width={28} height={28} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">vibefin</span>
            <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">your daily market vibe check</span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex gap-1">
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                pathname === href
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
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider hidden sm:inline">{theme}</span>
          </button>

          {user ? (
            <>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {user.user_metadata?.full_name || user.email}
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
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
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
