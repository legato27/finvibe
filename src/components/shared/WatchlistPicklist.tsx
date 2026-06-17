"use client";

/**
 * Watchlist picklist shared by the three screener pages. Lets the user scope
 * the table to a single named watchlist (or "All names"). Membership lives in
 * Supabase (watchlists → watchlist_items); the screener rows come from the
 * backend, so this filters client-side by ticker membership.
 */
import type { WatchlistGroup } from "@/lib/supabase/hooks";

export const ALL_WATCHLISTS = "all";

/** The ticker set for the selected picklist value, or null for "All names". */
export function watchlistTickerSet(
  groups: WatchlistGroup[] | undefined,
  value: string,
): Set<string> | null {
  if (value === ALL_WATCHLISTS) return null;
  return groups?.find((g) => String(g.id) === value)?.tickers ?? null;
}

export function WatchlistPicklist({
  groups,
  value,
  onChange,
}: {
  groups: WatchlistGroup[] | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const list = groups ?? [];
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Watchlist
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={list.length === 0}
        title={list.length === 0 ? "Log in and create a watchlist to filter by it" : undefined}
        className="rounded-md border border-border/30 bg-muted/50 px-2 py-1 text-xs text-foreground/90 focus:outline-none disabled:opacity-40"
      >
        <option value={ALL_WATCHLISTS}>All names</option>
        {list.map((g) => (
          <option key={g.id} value={String(g.id)}>
            {g.is_default ? "★ " : ""}
            {g.name} ({g.tickers.size})
          </option>
        ))}
      </select>
    </label>
  );
}
