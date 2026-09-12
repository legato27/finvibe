"use client";

/**
 * DataTable — the one table.
 *
 * WCAG 2.1 AA contract:
 *  - real <table> semantics: <th scope="col">, sortable headers as
 *    <button aria-sort>, caption for screen readers
 *  - row navigation via a guarded onClick on the row / card, with the first
 *    cell carrying a real link so middle-click and copy-link work
 *  - 14px minimum text, tabular numerals via the `nums` utility
 *
 * Density controls:
 *  - columns flagged `optional` are hidden until the user clicks "+ N more
 *    columns", so a dense screener can lead with the handful that matter.
 *  - below `sm` the table is replaced by a stacked card list (label/value
 *    pairs) so phones aren't a horizontally-scrolling 13-column table.
 *
 * Optional extras, so no page needs its own table:
 *  - `search`: a quick-search box over any text the caller derives per row
 *  - `groupBy`: collapsible group header rows (the "—" bucket sorts last)
 *  - `stickyHeader`: the header stays put inside a tall table
 *  - `toolbar`: caller controls (a group-by select, a scope picker) placed
 *    in the toolbar row next to the search box
 *
 * Caller rule: when `rowHref` is set, the FIRST column's cell must be plain
 * content (no nested <a>/<button>) — DataTable wraps it in the row link.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  ColumnFilterBar,
  applyFilters,
  countActiveFilters,
  type FilterDef,
  type FilterState,
} from "@/components/shared/ColumnFilters";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** screen-reader / mobile-card label when header is an icon/abbreviation */
  ariaLabel?: string;
  sortable?: boolean;
  /** value used for sorting; defaults to cell text */
  sortValue?: (row: Row) => number | string | null | undefined;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** hide below this breakpoint (desktop table only) */
  hideBelow?: "sm" | "md" | "lg";
  /** hidden until the user expands "more columns" */
  optional?: boolean;
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
const DASH = "—";

function labelOf<Row>(c: Column<Row>): string {
  if (c.ariaLabel) return c.ariaLabel;
  if (typeof c.header === "string") return c.header;
  return c.key;
}

export default function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowHref,
  defaultSort,
  emptyText = DASH,
  filters,
  search,
  searchPlaceholder = "Search…",
  groupBy,
  stickyHeader = false,
  toolbar,
  countLabel,
  rowClassName,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** when set, the first cell carries a row-stretched link to this href */
  rowHref?: (row: Row) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  emptyText?: string;
  /** optional type-aware per-column filters, rendered as a bar above the table */
  filters?: FilterDef<Row>[];
  /** text to quick-search over, per row; enables the search box */
  search?: (row: Row) => string;
  searchPlaceholder?: string;
  /** group label per row; enables collapsible group rows */
  groupBy?: (row: Row) => string;
  stickyHeader?: boolean;
  /** caller controls shown in the toolbar row */
  toolbar?: ReactNode;
  /** "12 names" — shown at the right of the toolbar */
  countLabel?: (n: number) => string;
  /** extra classes for one row, e.g. a tint on a baseline or total row */
  rowClassName?: (row: Row) => string | undefined;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [filterState, setFilterState] = useState<FilterState>({});
  const [showOptional, setShowOptional] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const router = useRouter();

  const optionalCount = columns.filter((c) => c.optional).length;
  const cols = useMemo(
    () => (showOptional ? columns : columns.filter((c) => !c.optional)),
    [columns, showOptional],
  );

  const filtered = useMemo(() => {
    let out = filters?.length ? applyFilters(rows, filters, filterState) : rows;
    const q = query.trim().toLowerCase();
    if (search && q) out = out.filter((r) => search(r).toLowerCase().includes(q));
    return out;
  }, [rows, filters, filterState, search, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const sv = col.sortValue;
    return [...filtered].sort((a, b) => {
      const va = sv(a), vb = sv(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  // Groups keep the sort order inside each group; the "—" bucket is pinned last.
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, Row[]>();
    for (const r of sorted) {
      const label = groupBy(r) || DASH;
      (map.get(label) ?? map.set(label, []).get(label)!).push(r);
    }
    return [...map.entries()].sort(([a], [b]) => (a === DASH ? 1 : b === DASH ? -1 : a.localeCompare(b)));
  }, [sorted, groupBy]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const toggleGroup = (label: string) =>
    setCollapsed((prev) => { const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next; });

  const hasFilters = !!filters?.length;
  const activeFilterCount = hasFilters ? countActiveFilters(filters!, filterState) : 0;
  const narrowed = activeFilterCount > 0 || query.trim().length > 0;
  const navTo = (row: Row) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,select")) return;
    const href = rowHref?.(row);
    if (href) router.push(href);
  };

  const emptyMessage = narrowed ? "No rows match the active filters." : emptyText;
  const hasToolbar = !!search || !!toolbar || !!countLabel;

  const renderRow = (row: Row) => {
    const href = rowHref?.(row);
    return (
      <tr
        key={rowKey(row)}
        onClick={href ? navTo(row) : undefined}
        className={`border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40 focus-within:bg-muted/40 ${href ? "cursor-pointer" : ""} ${rowClassName?.(row) ?? ""}`}
      >
        {cols.map((c, i) => (
          <td
            key={c.key}
            className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.className ?? ""}`}
          >
            {i === 0 && href ? (
              <Link href={href} className="font-medium text-foreground hover:underline">{c.cell(row)}</Link>
            ) : (
              c.cell(row)
            )}
          </td>
        ))}
      </tr>
    );
  };

  const renderCard = (row: Row) => {
    const href = rowHref?.(row);
    const [first, ...rest] = cols;
    return (
      <div
        key={rowKey(row)}
        onClick={href ? navTo(row) : undefined}
        className={`card p-3 ${href ? "cursor-pointer active:bg-muted/40" : ""} ${rowClassName?.(row) ?? ""}`}
      >
        <div className="mb-2 text-sm font-semibold text-foreground">
          {first && (href ? <Link href={href} className="hover:underline">{first.cell(row)}</Link> : first.cell(row))}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          {rest.map((c) => (
            <div key={c.key} className="flex min-w-0 flex-col gap-0.5">
              <dt className="stat-label truncate">{labelOf(c)}</dt>
              <dd className="truncate text-xs text-foreground">{c.cell(row)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  const groupHeader = (label: string, count: number, colSpan: number) => {
    const isCollapsed = collapsed.has(label);
    return (
      <tr key={`group-${label}`} className="border-b border-border bg-muted/40">
        <td colSpan={colSpan} className="px-3 py-1.5">
          <button
            type="button"
            onClick={() => toggleGroup(label)}
            aria-expanded={!isCollapsed}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="font-mono uppercase tracking-[0.12em]">{label}</span>
            <span className="nums font-mono font-normal text-dim">({count})</span>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-2">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative min-w-[160px] max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-control border border-border bg-card py-1.5 pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          {toolbar}
          {countLabel && <span className="ml-auto font-mono text-[11px] text-muted-foreground">{countLabel(filtered.length)}</span>}
        </div>
      )}

      {hasFilters && (
        <ColumnFilterBar rows={rows} defs={filters!} state={filterState} setState={setFilterState} />
      )}

      {optionalCount > 0 && (
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          aria-expanded={showOptional}
          className="text-xs text-signal hover:underline"
        >
          {showOptional ? "Show fewer columns" : `+ ${optionalCount} more column${optionalCount > 1 ? "s" : ""}`}
        </button>
      )}

      {/* ── Desktop: real table ─────────────────────────────── */}
      <div className="hidden overflow-x-auto rounded-panel border border-border sm:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className={stickyHeader ? "sticky top-0 z-10 bg-card/95 backdrop-blur" : ""}>
            <tr className="border-b border-border bg-muted/50">
              {cols.map((c) => {
                const sortedHere = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sortedHere ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`whitespace-nowrap px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${
                      sortedHere ? "text-signal" : "text-muted-foreground"
                    } ${c.align === "right" ? "text-right" : "text-left"} ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        aria-label={typeof c.header === "string" ? `Sort by ${c.header}` : c.ariaLabel}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${c.align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        {c.header}
                        <span aria-hidden="true" className={`text-[11px] ${sortedHere ? "text-signal" : "text-dim"}`}>
                          {sortedHere ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-6 text-center text-muted-foreground">{emptyMessage}</td>
              </tr>
            )}
            {groups == null && sorted.map(renderRow)}
            {groups != null &&
              groups.map(([label, groupRows]) => [
                groupHeader(label, groupRows.length, cols.length),
                ...(collapsed.has(label) ? [] : groupRows.map(renderRow)),
              ])}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked cards ───────────────────────────── */}
      <div className="space-y-2 sm:hidden">
        {sorted.length === 0 && (
          <div className="card py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        )}
        {groups == null && sorted.map(renderCard)}
        {groups != null &&
          groups.map(([label, groupRows]) => (
            <div key={label} className="space-y-2">
              <div className="stat-label px-1 pt-1">{label} · {groupRows.length}</div>
              {groupRows.map(renderCard)}
            </div>
          ))}
      </div>
    </div>
  );
}
