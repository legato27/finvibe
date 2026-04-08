"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { BarChart2, Briefcase, BookOpen, LogOut, LogIn } from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

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

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart2, public: true },
    { href: "/watchlist", label: "Watchlists", icon: BookOpen, public: false },
    { href: "/portfolio", label: "Portfolio", icon: Briefcase, public: false },
  ];

  const visibleItems = navItems.filter((item) => item.public || user);

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-[1600px] flex items-center h-14 gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/vibefin-icon.svg" alt="VibeFin" width={28} height={28} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground leading-tight">vibefin</span>
            <span className="text-[10px] text-slate-500 leading-tight hidden sm:block">your daily market vibe check</span>
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
                  : "text-slate-400 hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="text-xs text-slate-400 hidden sm:block">
                {user.user_metadata?.full_name || user.email}
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
