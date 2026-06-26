"use client";

/**
 * WatchlistTable — the industry-grade replacement for the watchlist card list.
 *
 * Adds, over the old `divide-y` row list:
 *  - sort on every column (sticky header, asc/desc/▲▼↕ indicators, aria-sort)
 *  - group-by sector / industry / moat / verdict / PAM direction, collapsible
 *  - instant quick-search filtering by symbol or name
 *  - PAM strategy + option strategy columns
 *
 * Follows DataTable's a11y contract: real <table> semantics, <th scope="col">,
 * sortable headers as <button aria-sort>, 14px min text, tabular numerals
 * (`nums`), overflow-x-auto, and a guarded row onClick that ignores clicks that
 * land on a nested <a>/<button>.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Search,
  Building2,
  TrendingUp,
  TrendingDown,
  Brain,
  Briefcase,
  X,
  ChevronRight,
  ChevronDown,
  Layers,
} from "lucide-react";
import VerdictBadge, { type VerdictJson, type VerdictState } from "@/components/ui/VerdictBadge";
import { PamBadge, type PamSummary } from "@/components/shared/PamBadge";
import LivePrice from "@/components/ui/LivePrice";
import { formatMoS } from "@/lib/valuation";
import { moatStyle, signTextClass, directionTextClass, normalizeDirection } from "@/lib/signals";

export interface OptStrategy {
  strategy: string;
  conviction: number | null;
  side?: string | null;
}

/** Flattened, enrichment-merged row the watchlist page hands to the grid. */
export interface WatchRow {
  id: number; // watchlist_items.id
  stockId: number; // stock_catalog.id
  ticker: string;
  name: string | null;
  sector: string | null; // display label (first part + "+N")
  sectorGroup: string | null; // canonical first sector, used for grouping
  sectorIsAi: boolean;
  industry: string | null;
  isEtf: boolean;
  moat: string | null;
  moatIsAi: boolean;
  enrichmentStatus: string | null;
  hasThoughts: boolean;
  price: number | null; // shown price (live ?? last)
  livePrice: number | null;
  lastPriceUpdatedAt: string | null;
  fairValue: number | null;
  mos: number | null;
  aiIntrinsic: number | null;
  aiMos: number | null; // fraction (e.g. 0.23 = 23%)
  trend: string | null; // quarterly_trend: up | flat | down
  verdict: VerdictJson | null;
  pam: PamSummary | null;
  opt: OptStrategy | null;
}

type SortKey =
  | "ticker"
  | "name"
  | "sector"
  | "industry"
  | "price"
  | "mos"
  | "fairValue"
  | "aiMos"
  | "trend"
  | "verdict"
  | "pam"
  | "opt";

type GroupKey = "none" | "sector" | "industry" | "moat" | "verdict" | "pam";

const VERDICT_RANK: Record<VerdictState, number> = {
  STRONG_LONG: 5,
  LONG: 4,
  NEUTRAL: 3,
  CONFLICTING: 2,
  SHORT: 1,
  STRONG_SHORT: 0,
};

const TREND_RANK: Record<string, number> = { up: 2, flat: 1, down: 0 };

const DASH = "—";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > 3600_000; // > 1h
}

/** Per-column sort value. null/undefined always sort last (DataTable convention). */
function sortValueFor(key: SortKey, r: WatchRow): number | string | null | undefined {
  switch (key) {
    case "ticker":
      return r.ticker;
    case "name":
      return r.name?.toLowerCase();
    case "sector":
      return r.sectorGroup?.toLowerCase();
    case "industry":
      return r.industry?.toLowerCase();
    case "price":
      return r.price;
    case "mos":
      return r.mos;
    case "fairValue":
      return r.fairValue;
    case "aiMos":
      return r.aiMos;
    case "trend":
      return r.trend ? TREND_RANK[r.trend] ?? null : null;
    case "verdict":
      return r.verdict?.state ? VERDICT_RANK[r.verdict.state] ?? null : null;
    case "pam":
      return r.pam?.setup ? `${r.pam.direction ?? "z"}-${r.pam.setup}` : null;
    case "opt":
      return r.opt?.strategy ?? null;
  }
}

export default function WatchlistTable({
  rows,
  onAddToPortfolio,
  onRemove,
}: {
  rows: WatchRow[];
  onAddToPortfolio: (row: WatchRow) => void;
  onRemove: (row: WatchRow) => void;
}) {
  const t = useTranslations("watchlist");
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "ticker", dir: "asc" });
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const toggleGroup = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // 1) quick-search (symbol OR name)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.ticker.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  // 2) sort
  const sorted = useMemo(() => {
    const sv = (r: WatchRow) => sortValueFor(sort.key, r);
    return [...filtered].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  // 3) group (preserving sort order within each group)
  const groupLabel = (r: WatchRow): string => {
    switch (groupBy) {
      case "sector":
        return r.sectorGroup || DASH;
      case "industry":
        return r.industry || DASH;
      case "moat":
        return r.moat || DASH;
      case "verdict":
        return r.verdict?.state || DASH;
      case "pam":
        return r.pam?.direction ? r.pam.direction : DASH;
      default:
        return "";
    }
  };

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, WatchRow[]>();
    for (const r of sorted) {
      const label = groupLabel(r);
      (map.get(label) ?? map.set(label, []).get(label)!).push(r);
    }
    // alphabetical, with the "—" bucket pinned last
    return [...map.entries()].sort(([a], [b]) => {
      if (a === DASH) return 1;
      if (b === DASH) return -1;
      return a.localeCompare(b);
    });
  }, [sorted, groupBy]);

  const COL_COUNT = 13;

  const arrow = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕";

  const header = (
    key: SortKey,
    label: React.ReactNode,
    opts: { align?: "left" | "right"; hide?: "sm" | "md" | "lg"; ariaLabel?: string } = {},
  ) => {
    const sortedHere = sort.key === key;
    const hideCls =
      opts.hide === "sm"
        ? "hidden sm:table-cell"
        : opts.hide === "md"
        ? "hidden md:table-cell"
        : opts.hide === "lg"
        ? "hidden lg:table-cell"
        : "";
    return (
      <th
        scope="col"
        aria-sort={sortedHere ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
          opts.align === "right" ? "text-right" : "text-left"
        } ${hideCls}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          aria-label={typeof label === "string" ? `Sort by ${label}` : opts.ariaLabel}
          className={`inline-flex items-center gap-1 hover:text-foreground ${
            opts.align === "right" ? "flex-row-reverse" : ""
          }`}
        >
          {label}
          <span aria-hidden="true" className="text-[11px]">
            {arrow(key)}
          </span>
        </button>
      </th>
    );
  };

  const rowCells = (r: WatchRow) => (
    <>
      {/* Symbol + inline badges */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={`/stock/${r.ticker}`} className="font-mono text-sm font-bold text-primary hover:underline">
            {r.ticker}
          </Link>
          {moatStyle(r.moat).show && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border ${moatStyle(r.moat).badgeClass}`}
            >
              {r.moat}
              {r.moatIsAi ? " (AI)" : ""}
            </span>
          )}
          {r.enrichmentStatus === "pending" && (
            <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-signal-caution rounded animate-pulse">
              {t("pending")}
            </span>
          )}
          {r.enrichmentStatus === "processing" && (
            <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-sky-700 dark:text-sky-400 rounded animate-pulse">
              {t("enriching")}
            </span>
          )}
          {r.hasThoughts && (
            <span title={t("thoughtsAvailable")}>
              <Brain className="w-3 h-3 text-primary/50" aria-label={t("thoughtsAvailable")} />
            </span>
          )}
        </div>
      </td>

      {/* Name */}
      <td className="px-3 py-2 hidden md:table-cell">
        <span className="text-xs text-muted-foreground truncate block max-w-[220px]">{r.name || DASH}</span>
      </td>

      {/* Sector */}
      <td className="px-3 py-2 hidden sm:table-cell">
        {r.sector ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            <Building2 className="w-2.5 h-2.5 text-muted-foreground/60" />
            {r.sector}
            {r.sectorIsAi ? " (AI)" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* Industry */}
      <td className="px-3 py-2 hidden lg:table-cell">
        <span className="text-[11px] text-muted-foreground/70">{r.industry || DASH}</span>
      </td>

      {/* Price */}
      <td className="px-3 py-2 text-right">
        {r.price != null && r.price > 0 ? (
          <div className="text-right">
            <LivePrice price={r.price} currency="$" live={r.livePrice != null} className="text-sm text-foreground" />
            {r.livePrice == null && r.lastPriceUpdatedAt && (
              <div
                className={`text-[10px] ${
                  isStale(r.lastPriceUpdatedAt) ? "text-amber-400/70" : "text-muted-foreground/40"
                }`}
              >
                {timeAgo(r.lastPriceUpdatedAt)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* MoS (quant) */}
      <td className="px-3 py-2 text-right">
        {r.mos != null ? (
          <span
            className={`nums font-mono text-xs inline-flex items-center justify-end gap-0.5 ${signTextClass(r.mos)}`}
          >
            {r.mos > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {formatMoS(r.mos)}
          </span>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* Fair value */}
      <td className="px-3 py-2 text-right hidden lg:table-cell">
        {r.fairValue != null ? (
          <span className="nums font-mono text-xs text-muted-foreground">${r.fairValue.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* AI MoS */}
      <td className="px-3 py-2 text-right hidden lg:table-cell">
        {r.aiMos != null ? (
          <span className={`nums font-mono text-xs ${signTextClass(r.aiMos)}`}>
            {formatMoS(r.aiMos)}
          </span>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* Trend */}
      <td className="px-3 py-2 text-right hidden md:table-cell">
        {r.trend ? (
          <span className={`text-xs ${directionTextClass(normalizeDirection(r.trend))}`}>
            {r.trend === "up" ? "↑" : r.trend === "down" ? "↓" : "→"} Q
          </span>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* Verdict */}
      <td className="px-3 py-2">
        {r.verdict?.state ? <VerdictBadge state={r.verdict.state} size="sm" /> : <span className="text-muted-foreground/50">{DASH}</span>}
      </td>

      {/* PAM */}
      <td className="px-3 py-2 hidden md:table-cell">
        <PamBadge pam={r.pam} />
      </td>

      {/* Option strategy */}
      <td className="px-3 py-2 hidden md:table-cell">
        {r.opt?.strategy ? (
          <span
            title={r.opt.conviction != null ? `${(r.opt.conviction * 100).toFixed(0)}% conviction` : undefined}
            className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary"
          >
            {r.opt.strategy}
          </span>
        ) : (
          <span className="text-muted-foreground/50">{DASH}</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onAddToPortfolio(r)}
            className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title={t("addToPortfolioTitle")}
            aria-label={t("addToPortfolioTitle")}
          >
            <Briefcase className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => onRemove(r)}
            className="p-1.5 rounded text-muted-foreground hover:text-signal-short hover:bg-signal-short-bg transition-colors"
            aria-label={t("remove")}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </>
  );

  const dataRow = (r: WatchRow) => (
    <tr
      key={r.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(`/stock/${r.ticker}`);
      }}
      className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/50 focus-within:bg-accent/50"
    >
      {rowCells(r)}
    </tr>
  );

  return (
    <div className="space-y-2 p-2">
      {/* Toolbar: quick-search + group-by + count */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("quickSearchPh")}
            aria-label={t("quickSearchPh")}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("groupBy")}</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupKey)}
            className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="none">{t("groupNone")}</option>
            <option value="sector">{t("groupSector")}</option>
            <option value="industry">{t("groupIndustry")}</option>
            <option value="moat">{t("groupMoat")}</option>
            <option value="verdict">{t("groupVerdict")}</option>
            <option value="pam">{t("groupPam")}</option>
          </select>
        </label>
        <span className="ml-auto text-[11px] text-muted-foreground/60">
          {t("resultCount", { count: filtered.length })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border">
              {header("ticker", t("columnTicker"))}
              {header("name", t("columnName"), { hide: "md" })}
              {header("sector", t("columnSector"), { hide: "sm" })}
              {header("industry", t("columnIndustry"), { hide: "lg" })}
              {header("price", t("columnPrice"), { align: "right" })}
              {header("mos", t("mos"), { align: "right" })}
              {header("fairValue", t("fairValue"), { align: "right", hide: "lg" })}
              {header("aiMos", t("mosAi"), { align: "right", hide: "lg" })}
              {header("trend", t("trend"), { align: "right", hide: "md" })}
              {header("verdict", t("columnVerdict"))}
              {header("pam", t("columnPam"), { hide: "md" })}
              {header("opt", t("columnOption"), { hide: "md" })}
              <th scope="col" className="px-3 py-2 text-right">
                <span className="sr-only">{t("remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                  {t("noMatch")}
                </td>
              </tr>
            )}

            {/* Ungrouped */}
            {groups == null && sorted.map((r) => dataRow(r))}

            {/* Grouped */}
            {groups != null &&
              groups.map(([label, groupRows]) => {
                const isCollapsed = collapsed.has(label);
                return (
                  <GroupBlock
                    key={label}
                    label={label}
                    count={groupRows.length}
                    collapsed={isCollapsed}
                    colSpan={COL_COUNT}
                    onToggle={() => toggleGroup(label)}
                  >
                    {!isCollapsed && groupRows.map((r) => dataRow(r))}
                  </GroupBlock>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupBlock({
  label,
  count,
  collapsed,
  colSpan,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  colSpan: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-muted/40">
        <td colSpan={colSpan} className="px-3 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span className="uppercase tracking-wider">{label}</span>
            <span className="text-muted-foreground/60 font-normal">({count})</span>
          </button>
        </td>
      </tr>
      {children}
    </>
  );
}
