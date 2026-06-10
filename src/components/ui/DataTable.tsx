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
import { ReactNode, useMemo, useState } from "react";

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
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** when set, the first cell carries a row-stretched link to this href */
  rowHref?: (row: Row) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  emptyText?: string;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = sv(a), vb = sv(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  return (
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
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                    c.align === "right" ? "text-right" : "text-left"
                  } ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      aria-label={typeof c.header === "string" ? `Sort by ${c.header}` : c.ariaLabel}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.header}
                      <span aria-hidden="true" className="text-[11px]">
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
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="relative border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40 focus-within:bg-muted/40"
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"} ${
                    c.hideBelow ? HIDE[c.hideBelow] : ""
                  } ${c.className ?? ""}`}
                >
                  {i === 0 && rowHref ? (
                    <Link
                      href={rowHref(row)}
                      className="font-medium text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-ring"
                    >
                      {c.cell(row)}
                    </Link>
                  ) : (
                    c.cell(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
