"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { BarChart2, Briefcase, BookOpen, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
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
    router.push("/login");
    router.refresh();
  }

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
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            href="/watchlist"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Watchlists
          </Link>
          <Link
            href="/portfolio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Briefcase className="w-4 h-4" />
            Portfolio
          </Link>
        </nav>

        {/* Right side: user */}
        <div className="ml-auto flex items-center gap-3">
          {user && (
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
          )}
        </div>
      </div>
    </header>
  );
}
