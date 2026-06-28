"use client";

/**
 * One-click watchlist star for screener rows (ranked / multibagger / options).
 * Filled when the ticker is in any of the user's watchlists; click toggles.
 * Hidden when signed out. `relative z-10` keeps it clickable above the
 * row-stretched link overlay used by DataTable / table rows.
 */
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMyWatchlistTickers, useToggleWatchlistTicker, useUser } from "@/lib/supabase/hooks";

export function WatchlistStar({ ticker, className = "" }: { ticker: string; className?: string }) {
  const t = useTranslations("watchlist");
  const { data: user } = useUser();
  const { data: myTickers } = useMyWatchlistTickers();
  const toggle = useToggleWatchlistTicker();

  if (!user) return null;

  const starred = myTickers?.has(ticker.toUpperCase()) ?? false;
  const label = starred
    ? t("removeFromWatchlistAction", { ticker })
    : t("addToWatchlistAction", { ticker });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(ticker);
      }}
      disabled={toggle.isPending}
      title={label}
      aria-label={label}
      aria-pressed={starred}
      className={`relative z-10 p-1 rounded transition-colors disabled:opacity-50 ${
        starred
          ? "text-warning hover:text-warning"
          : "text-muted-foreground/40 hover:text-warning"
      } ${className}`}
    >
      <Star className={`w-3.5 h-3.5 ${starred ? "fill-current" : ""}`} aria-hidden="true" />
    </button>
  );
}
