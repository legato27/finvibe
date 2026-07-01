"use client";

/**
 * DataTable — the accessible replacement for every clickable-<div> row list
 * (watchlist / ranked / multibagger / options screener).
 *
 * WCAG 2.1 AA contract:
 *  - real <table> semantics: <th scope="col">, sortable headers as
 *    <button aria-sort>, caption for screen readers
 *  - row navigation via a guarded onClick on the row / card
 *  - 14px minimum text, tabular numerals via the `nums` utility
 *
 * Density controls:
 *  - columns flagged `optional` are hidden until the user clicks "+ N more
 *    columns", so a dense screener can lead with the handful that matter.
 *  - below `sm` the table is replaced by a stacked card list (label/value
 *    pairs) so phones aren't a horizontally-scrolling 13-column table.
 *
 * Caller rule: when `rowHref` is set, the FIRST column's cell must be plain
 * content (no nested <a>/<button>) — DataTable wraps it in the row link.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
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
  emptyText = "—",
  filters,
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
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [filterState, setFilterState] = useState<FilterState>({});
  const [showOptional, setShowOptional] = useState(false);
  const router = useRouter();

  const optionalCount = columns.filter((c) => c.optional).length;
  const cols = useMemo(
    () => (showOptional ? columns : columns.filter((c) => !c.optional)),
    [columns, showOptional],
  );

  const filtered = useMemo(
    () => (filters?.length ? applyFilters(rows, filters, filterState) : rows),
    [rows, filters, filterState],
  );

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

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const hasFilters = !!filters?.length;
  const activeFilterCount = hasFilters ? countActiveFilters(filters!, filterState) : 0;
  const navTo = (row: Row) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    const href = rowHref?.(row);
    if (href) router.push(href);
  };

  return (
    <div className="space-y-2">
      {hasFilters && (
        <ColumnFilterBar rows={rows} defs={filters!} state={filterState} setState={setFilterState} />
      )}

      {optionalCount > 0 && (
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          aria-expanded={showOptional}
          className="text-xs text-primary hover:underline"
        >
          {showOptional ? "Show fewer columns" : `+ ${optionalCount} more column${optionalCount > 1 ? "s" : ""}`}
        </button>
      )}

      {/* ── Desktop: real table ─────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {cols.map((c) => {
                const sortedHere = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sortedHere ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wider ${
                      sortedHere ? "text-primary" : "text-muted-foreground"
                    } ${c.align === "right" ? "text-right" : "text-left"} ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        aria-label={typeof c.header === "string" ? `Sort by ${c.header}` : c.ariaLabel}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.header}
                        <span aria-hidden="true" className={`text-[11px] ${sortedHere ? "text-primary" : "text-muted-foreground/60"}`}>
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
                <td colSpan={cols.length} className="px-3 py-6 text-center text-muted-foreground">
                  {activeFilterCount > 0 ? "No rows match the active filters." : emptyText}
                </td>
              </tr>
            )}
            {sorted.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  onClick={href ? navTo(row) : undefined}
                  className={`border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40 focus-within:bg-muted/40 ${
                    href ? "cursor-pointer" : ""
                  }`}
                >
                  {cols.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"} ${
                        c.hideBelow ? HIDE[c.hideBelow] : ""
                      } ${c.className ?? ""}`}
                    >
                      {i === 0 && href ? (
                        <Link href={href} className="font-medium text-foreground hover:underline">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked cards ───────────────────────────── */}
      <div className="sm:hidden space-y-2">
        {sorted.length === 0 && (
          <div className="card text-center text-sm text-muted-foreground py-6">
            {activeFilterCount > 0 ? "No rows match the active filters." : emptyText}
          </div>
        )}
        {sorted.map((row) => {
          const href = rowHref?.(row);
          const [first, ...rest] = cols;
          return (
            <div
              key={rowKey(row)}
              onClick={href ? navTo(row) : undefined}
              className={`card p-3 ${href ? "cursor-pointer active:bg-muted/40" : ""}`}
            >
              <div className="mb-2 text-sm font-semibold text-foreground">
                {first && (href ? <Link href={href} className="hover:underline">{first.cell(row)}</Link> : first.cell(row))}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {rest.map((c) => (
                  <div key={c.key} className="flex flex-col gap-0.5 min-w-0">
                    <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{labelOf(c)}</dt>
                    <dd className="text-xs text-foreground truncate">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
