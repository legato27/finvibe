"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useWatchlists } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";
import { stocksApi } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrendingUp, TrendingDown, Eye, ChevronRight, Lock } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { formatMoS } from "@/lib/valuation";
import { moatStyle } from "@/lib/signals";
import VerdictBadge, { type VerdictJson } from "@/components/ui/VerdictBadge";

/**
 * Compact watchlist summary for the dashboard.
 * - Logged in: shows user's default watchlist stocks with enrichment data
 * - Public: shows a prompt to sign in
 */
export function WatchlistGlance() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
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
        <div className="card-header"><span className="card-title">{t("watchlist")}</span></div>
        <div className="text-muted-foreground text-sm animate-pulse py-8 text-center">{tc("loading")}</div>
      </div>
    );
  }

  if (!user) {
    return <PublicWatchlist />;
  }

  return <AuthenticatedWatchlist />;
}

function PublicWatchlist() {
  const t = useTranslations("dashboard");
  return (
    <div className="card h-full">
      <div className="card-header">
        <span className="card-title">{t("watchlist")}</span>
      </div>
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Lock className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm font-medium text-slate-400">{t("watchlistPersonal")}</p>
        <p className="text-xs text-slate-600 mt-1 mb-4">{t("watchlistSignInPrompt")}</p>
        <Link
          href="/login"
          className="px-4 py-2 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
        >
          {t("watchlistSignInCta")}
        </Link>
      </div>
    </div>
  );
}

function AuthenticatedWatchlist() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const { data: watchlists, isLoading } = useWatchlists();

  // Get default watchlist, or first one
  const defaultWl = watchlists?.find((w: any) => w.is_default) || watchlists?.[0];
  const items = defaultWl?.watchlist_items || [];

  // Unified arbitrated verdict per visible ticker — the same signal the
  // watchlist page shows, so the glance can't imply a bullish read (positive
  // MoS / Wide moat) for a stock the engine rates short. (Hook must run before
  // any early return.)
  const tickers: string[] = items
    .slice(0, 10)
    .map((i: any) => i.stock_catalog?.ticker)
    .filter(Boolean);
  const { data: verdictMap } = useQuery<Record<string, VerdictJson | null>>({
    queryKey: ["glance-verdicts", tickers],
    queryFn: () => stocksApi.verdictBatch(tickers),
    enabled: tickers.length > 0,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="card h-full">
        <div className="card-header"><span className="card-title">{t("watchlist")}</span></div>
        <div className="text-muted-foreground text-sm animate-pulse py-8 text-center">{t("watchlistLoading")}</div>
      </div>
    );
  }

  if (!defaultWl || items.length === 0) {
    return (
      <div className="card h-full">
        <div className="card-header">
          <span className="card-title">{t("watchlist")}</span>
          <Link href="/watchlist" className="text-xs text-slate-400 hover:text-primary flex items-center gap-0.5">
            {t("manage")} <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Eye className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">{t("watchlistEmpty")}</p>
          <Link href="/watchlist" className="text-xs text-primary mt-1 hover:underline">
            {t("addStocks")}
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
          {t("viewAll")} <ChevronRight className="w-3 h-3" />
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
              className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors cursor-pointer"
              onClick={() => router.push(`/stock/${stock.ticker}`)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-primary">
                      {stock.ticker}
                    </span>
                    {verdictMap?.[stock.ticker]?.state && (
                      <VerdictBadge state={verdictMap[stock.ticker]!.state} size="sm" />
                    )}
                    {hasMoat && (
                      <span className={`text-[9px] px-1 py-0 rounded border ${moatStyle(stock.moat_rating).badgeClass}`}>
                        {stock.moat_rating}
                      </span>
                    )}
                    {stock.enrichment_status === "pending" && (
                      <span className="text-[9px] text-amber-400 animate-pulse">{t("statusPending")}</span>
                    )}
                    {stock.enrichment_status === "processing" && (
                      <span className="text-[9px] text-amber-400 animate-pulse">{t("statusEnriching")}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
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
                    mosPositive ? "text-signal-long" : "text-signal-short"
                  }`}>
                    {mosPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {formatMoS(stock.margin_of_safety)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 10 && (
        <div className="pt-2 border-t border-border/30 mt-1 flex-shrink-0">
          <Link href="/watchlist" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            {t("moreStocks", { count: items.length - 10 })}
          </Link>
        </div>
      )}
    </div>
  );
}
