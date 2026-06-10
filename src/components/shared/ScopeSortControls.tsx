"use client";

/**
 * Shared controls for the screener pages (/options, /ranked):
 *  - Scope toggle: "My watchlist" (default) vs "All". Disabled with a hint when
 *    the user is logged out or has no watchlist.
 *  - Optional "Sort by" selector.
 */
export interface SortOption {
  value: string;
  label: string;
}

export function ScopeSortControls({
  scope,
  onScope,
  hasMine,
  mineCount,
  sort,
  sortOptions,
  onSort,
}: {
  scope: "mine" | "all";
  onScope: (s: "mine" | "all") => void;
  hasMine: boolean;
  mineCount?: number;
  sort?: string;
  sortOptions?: SortOption[];
  onSort?: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30">
        <button
          onClick={() => onScope("mine")}
          disabled={!hasMine}
          title={hasMine ? "Only names in your watchlist" : "Log in and add names to your watchlist to use this"}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            scope === "mine" && hasMine ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground/80"
          }`}
        >
          My watchlist{hasMine && mineCount != null ? ` (${mineCount})` : ""}
        </button>
        <button
          onClick={() => onScope("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            scope === "all" || !hasMine ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground/80"
          }`}
        >
          All
        </button>
      </div>

      {sortOptions && onSort && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            className="bg-muted/50 border border-border/30 rounded-md px-2 py-1 text-xs text-foreground/90 focus:outline-none"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
