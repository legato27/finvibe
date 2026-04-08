"use client";
import { useAppStore } from "@/store/useAppStore";
import Link from "next/link";
import { TrendingUp, TrendingDown, Eye, ChevronRight } from "lucide-react";

/**
 * Compact watchlist summary for the dashboard — shows top stocks at a glance.
 */
export function WatchlistGlance() {
  const watchlist = useAppStore((s) => s.watchlist);

  if (!watchlist || watchlist.length === 0) {
    return (
      <div className="card h-full">
        <div className="card-header">
          <span className="card-title">Watchlist</span>
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

  // Show up to 10 stocks
  const stocks = watchlist.slice(0, 10);

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header flex items-center justify-between flex-shrink-0">
        <span className="card-title">Watchlist</span>
        <Link
          href="/watchlist"
          className="text-xs text-slate-400 hover:text-primary flex items-center gap-0.5 transition-colors"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {stocks.map((stock) => {
          const hasPrice = stock.last_price != null && stock.last_price > 0;
          const hasMoat = stock.moat_rating && stock.moat_rating !== "None";
          const mosPositive = (stock.margin_of_safety ?? 0) > 0;

          return (
            <Link
              key={stock.ticker}
              href={`/stock/${stock.ticker}`}
              className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-primary group-hover:underline">
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
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                    {stock.name || stock.sector || ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-right">
                {hasPrice && (
                  <span className="font-mono text-xs text-slate-300">
                    ${stock.last_price!.toFixed(2)}
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
                {stock.enrichment_status === "processing" && (
                  <span className="text-[9px] text-amber-400 animate-pulse">...</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {watchlist.length > 10 && (
        <div className="pt-2 border-t border-border/30 mt-1 flex-shrink-0">
          <Link
            href="/watchlist"
            className="text-xs text-slate-500 hover:text-primary transition-colors"
          >
            +{watchlist.length - 10} more stocks
          </Link>
        </div>
      )}
    </div>
  );
}
