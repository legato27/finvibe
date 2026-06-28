"use client";

/**
 * DataTable — the accessible replacement for every clickable-<div> row list
 * (watchlist / ranked / options screener).
 *
 * WCAG 2.1 AA contract:
 *  - real <table> semantics: <th scope="col">, sortable headers as
 *    <button aria-sort>, caption for screen readers
 *  - row navigation via a real <a> on the key cell, stretched over the row
 *    with a CSS overlay — native keyboard focus + screen-reader link semantics,
 *    no synthetic onClick divs
 *  - 14px minimum text, tabular numerals via the `nums` utility
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
  /** screen-reader label when header is an icon/abbreviation */
  ariaLabel?: string;
  sortable?: boolean;
  /** value used for sorting; defaults to cell text */
  sortValue?: (row: Row) => number | string | null | undefined;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** hide below this breakpoint */
  hideBelow?: "sm" | "md" | "lg";
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

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
  const router = useRouter();

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

  return (
    <div className="space-y-2">
      {hasFilters && (
        <ColumnFilterBar rows={rows} defs={filters!} state={filterState} setState={setFilterState} />
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((c) => {
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
              <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">
                {activeFilterCount > 0 ? "No rows match the active filters." : emptyText}
              </td>
            </tr>
          )}
          {sorted.map((row) => {
            const href = rowHref?.(row);
            return (
            <tr
              key={rowKey(row)}
              // Row navigation via a guarded onClick — reliable on every browser.
              // (The old CSS stretched-link relied on `position: relative` on the
              // <tr>, which iOS Safari ignores, so every row's overlay collapsed
              // onto one another and every tap hit the last row's link.)
              onClick={
                href
                  ? (e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      router.push(href);
                    }
                  : undefined
              }
              className={`border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40 focus-within:bg-muted/40 ${
                href ? "cursor-pointer" : ""
              }`}
            >
              {columns.map((c, i) => (
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
    </div>
  );
}
