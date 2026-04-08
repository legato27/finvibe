"use client";
import { useEffect, useState } from "react";
import { useWatchlists } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { TrendingUp, TrendingDown, Eye, ChevronRight, Lock } from "lucide-react";
import type { User } from "@supabase/supabase-js";

/**
 * Compact watchlist summary for the dashboard.
 * - Logged in: shows user's default watchlist stocks with enrichment data
 * - Public: shows a prompt to sign in
 */
export function WatchlistGlance() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="card h-full">
        <div className="card-header"><span className="card-title">Watchlist</span></div>
        <div className="text-slate-500 text-sm animate-pulse py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <PublicWatchlist />;
  }

  return <AuthenticatedWatchlist />;
}

function PublicWatchlist() {
  return (
    <div className="card h-full">
      <div className="card-header">
        <span className="card-title">Watchlist</span>
      </div>
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Lock className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm font-medium text-slate-400">Your personal watchlist</p>
        <p className="text-xs text-slate-600 mt-1 mb-4">Sign in to track stocks and build watchlists</p>
        <Link
          href="/login"
          className="px-4 py-2 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
        >
          Sign in to get started
        </Link>
      </div>
    </div>
  );
}

function AuthenticatedWatchlist() {
  const { data: watchlists, isLoading } = useWatchlists();

  if (isLoading) {
    return (
      <div className="card h-full">
        <div className="card-header"><span className="card-title">Watchlist</span></div>
        <div className="text-slate-500 text-sm animate-pulse py-8 text-center">Loading watchlist...</div>
      </div>
    );
  }

  // Get default watchlist, or first one
  const defaultWl = watchlists?.find((w: any) => w.is_default) || watchlists?.[0];
  const items = defaultWl?.watchlist_items || [];

  if (!defaultWl || items.length === 0) {
    return (
      <div className="card h-full">
        <div className="card-header">
          <span className="card-title">Watchlist</span>
          <Link href="/watchlist" className="text-xs text-slate-400 hover:text-primary flex items-center gap-0.5">
            Manage <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <Eye className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No stocks in watchlist</p>
          <Link href="/watchlist" className="text-xs text-primary mt-1 hover:underline">
            Add stocks
          </Link>
        </div>
      </div>
    );
  }

  const stocks = items.slice(0, 10);

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header flex items-center justify-between flex-shrink-0">
        <span className="card-title">{defaultWl.name}</span>
        <Link
          href="/watchlist"
          className="text-xs text-slate-400 hover:text-primary flex items-center gap-0.5 transition-colors"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {stocks.map((item: any) => {
          const stock = item.stock_catalog;
          if (!stock) return null;

          const hasPrice = stock.last_price != null && stock.last_price > 0;
          const hasMoat = stock.moat_rating && stock.moat_rating !== "None";
          const mosPositive = (stock.margin_of_safety ?? 0) > 0;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-primary">
                      {stock.ticker}
                    </span>
                    {hasMoat && (
                      <span className={`text-[9px] px-1 py-0 rounded ${
                        stock.moat_rating === "Wide"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}>
                        {stock.moat_rating}
                      </span>
                    )}
                    {stock.enrichment_status === "pending" && (
                      <span className="text-[9px] text-amber-400 animate-pulse">pending...</span>
                    )}
                    {stock.enrichment_status === "processing" && (
                      <span className="text-[9px] text-amber-400 animate-pulse">enriching...</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                    {stock.name || stock.sector || ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-right">
                {hasPrice && (
                  <span className="font-mono text-xs text-slate-300">
                    ${stock.last_price.toFixed(2)}
                  </span>
                )}
                {stock.margin_of_safety != null && (
                  <span className={`font-mono text-[10px] flex items-center gap-0.5 ${
                    mosPositive ? "text-green-400" : "text-red-400"
                  }`}>
                    {mosPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {(stock.margin_of_safety * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 10 && (
        <div className="pt-2 border-t border-border/30 mt-1 flex-shrink-0">
          <Link href="/watchlist" className="text-xs text-slate-500 hover:text-primary transition-colors">
            +{items.length - 10} more stocks
          </Link>
        </div>
      )}
    </div>
  );
}
