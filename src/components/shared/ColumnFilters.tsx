"use client";

/**
 * Reusable, table-agnostic column filtering for the screener pages.
 *
 * Both the DataTable-based options screener and the custom-table ranked /
 * multibagger screeners share this layer: a `useColumnFilters` hook that turns
 * a list of typed filter definitions into a filtered row set, and a
 * `<ColumnFilterBar>` that renders the controls.
 *
 * Filter kinds:
 *  - number  → min/max range (inclusive)
 *  - text    → case-insensitive substring
 *  - select  → multi-select; options auto-derived from the data (empty = all)
 */
import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export type FilterKind = "number" | "text" | "select";

export interface FilterDef<Row> {
  key: string;
  label: string;
  kind: FilterKind;
  /** value extractor for this column */
  value: (row: Row) => number | string | null | undefined;
  /** select only: map a raw value to its display label (defaults to the value) */
  optionLabel?: (v: string) => string;
}

export interface NumRange {
  min: number | null;
  max: number | null;
}
export type FilterValue = NumRange | string | string[];
export type FilterState = Record<string, FilterValue>;

function isActive(kind: FilterKind, v: FilterValue | undefined): boolean {
  if (v == null) return false;
  if (kind === "number") {
    const r = v as NumRange;
    return r.min != null || r.max != null;
  }
  if (kind === "text") return String(v).trim().length > 0;
  return (v as string[]).length > 0;
}

export function countActiveFilters<Row>(defs: FilterDef<Row>[], state: FilterState): number {
  return defs.reduce((n, d) => (isActive(d.kind, state[d.key]) ? n + 1 : n), 0);
}

/** Apply the current filter state to the rows. Pure — exported for testing/reuse. */
export function applyFilters<Row>(rows: Row[], defs: FilterDef<Row>[], state: FilterState): Row[] {
  const active = defs.filter((d) => isActive(d.kind, state[d.key]));
  if (!active.length) return rows;
  return rows.filter((row) =>
    active.every((def) => {
      const fv = state[def.key]!;
      const raw = def.value(row);
      if (def.kind === "number") {
        const r = fv as NumRange;
        if (raw == null || typeof raw !== "number" || Number.isNaN(raw)) return false;
        if (r.min != null && raw < r.min) return false;
        if (r.max != null && raw > r.max) return false;
        return true;
      }
      if (def.kind === "text") {
        const q = String(fv).trim().toLowerCase();
        return String(raw ?? "").toLowerCase().includes(q);
      }
      const sel = fv as string[];
      return sel.includes(String(raw ?? ""));
    }),
  );
}

export function useColumnFilters<Row>(rows: Row[], defs: FilterDef<Row>[]) {
  const [state, setState] = useState<FilterState>({});
  const filtered = useMemo(() => applyFilters(rows, defs, state), [rows, defs, state]);
  const activeCount = useMemo(() => countActiveFilters(defs, state), [defs, state]);
  return { filtered, state, setState, activeCount };
}

// ── UI ────────────────────────────────────────────────────────────

function NumberControl({
  range,
  onChange,
}: {
  range: NumRange | undefined;
  onChange: (r: NumRange) => void;
}) {
  const r = range ?? { min: null, max: null };
  const parse = (s: string): number | null => (s.trim() === "" ? null : Number(s));
  const cls =
    "w-20 rounded-md border border-border/30 bg-muted/50 px-2 py-1 text-xs nums focus:outline-none focus:ring-1 focus:ring-primary/50";
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        placeholder="min"
        value={r.min ?? ""}
        onChange={(e) => onChange({ ...r, min: parse(e.target.value) })}
        className={cls}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="number"
        inputMode="decimal"
        placeholder="max"
        value={r.max ?? ""}
        onChange={(e) => onChange({ ...r, max: parse(e.target.value) })}
        className={cls}
      />
    </div>
  );
}

function SelectControl({
  options,
  selected,
  optionLabel,
  onChange,
}: {
  options: string[];
  selected: string[];
  optionLabel?: (v: string) => string;
  onChange: (sel: string[]) => void;
}) {
  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(opt)}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
              on
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {optionLabel ? optionLabel(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

export function ColumnFilterBar<Row>({
  rows,
  defs,
  state,
  setState,
}: {
  rows: Row[];
  defs: FilterDef<Row>[];
  state: FilterState;
  setState: (updater: (s: FilterState) => FilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(defs, state);

  // Derive select options once per row set.
  const selectOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const def of defs) {
      if (def.kind !== "select") continue;
      const seen = new Set<string>();
      for (const row of rows) {
        const v = def.value(row);
        if (v != null && String(v) !== "") seen.add(String(v));
      }
      map[def.key] = [...seen].sort();
    }
    return map;
  }, [rows, defs]);

  const setOne = (key: string, v: FilterValue) => setState((s) => ({ ...s, [key]: v }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            activeCount > 0
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/30 bg-muted/50 text-muted-foreground hover:text-foreground/80"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setState(() => ({}))}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border/30 bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {defs.map((def) => (
            <div key={def.key} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {def.label}
              </span>
              {def.kind === "number" && (
                <NumberControl
                  range={state[def.key] as NumRange | undefined}
                  onChange={(r) => setOne(def.key, r)}
                />
              )}
              {def.kind === "text" && (
                <input
                  type="text"
                  value={(state[def.key] as string) ?? ""}
                  onChange={(e) => setOne(def.key, e.target.value)}
                  placeholder={`Filter ${def.label.toLowerCase()}…`}
                  className="w-40 rounded-md border border-border/30 bg-muted/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              )}
              {def.kind === "select" && (
                <SelectControl
                  options={selectOptions[def.key] ?? []}
                  selected={(state[def.key] as string[]) ?? []}
                  optionLabel={def.optionLabel}
                  onChange={(sel) => setOne(def.key, sel)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
