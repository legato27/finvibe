"use client";

/**
 * The watchlist's columns, for DataTable. The row shape is the
 * enrichment-merged record the watchlist page builds; the columns are
 * shared with anything else that lists watchlist rows.
 */
import { Briefcase, Brain, Building2, TrendingDown, TrendingUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { CryptoChip, CryptoNa } from "@/modules/crypto/components/CryptoSurfaces";
import type { Column } from "@/components/ui/DataTable";
import VerdictBadge, { type VerdictJson, type VerdictState } from "@/components/ui/VerdictBadge";
import { PamBadge, type PamSummary } from "@/components/shared/PamBadge";
import { SwingCell } from "@/components/shared/SwingLevels";
import LivePrice from "@/components/ui/LivePrice";
import { formatMoS } from "@/lib/valuation";
import { moatStyle, signTextClass, directionTextClass, normalizeDirection } from "@/lib/signals";
import { relativeAge } from "@/lib/relative";

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
  /** A yfinance index symbol (^GSPC): priced and given price action, never enriched. */
  isIndex: boolean;
  /** A coin (crypto module): live Binance price and price action, no financials or options. */
  isCrypto: boolean;
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

export type GroupKey = "none" | "sector" | "industry" | "moat" | "verdict" | "pam";
export const GROUP_KEYS: GroupKey[] = ["none", "sector", "industry", "moat", "verdict", "pam"];

const DASH = "—";
const VERDICT_RANK: Record<VerdictState, number> = {
  STRONG_LONG: 5, LONG: 4, NEUTRAL: 3, CONFLICTING: 2, SHORT: 1, STRONG_SHORT: 0,
};
const TREND_RANK: Record<string, number> = { up: 2, flat: 1, down: 0 };

export function groupLabelFor(key: GroupKey): ((r: WatchRow) => string) | undefined {
  switch (key) {
    case "sector": return (r) => r.sectorGroup || DASH;
    case "industry": return (r) => r.industry || DASH;
    case "moat": return (r) => r.moat || DASH;
    case "verdict": return (r) => r.verdict?.state || DASH;
    case "pam": return (r) => r.pam?.direction || DASH;
    default: return undefined;
  }
}

const isStale = (iso: string | null) => !iso || Date.now() - new Date(iso).getTime() > 3600_000;
const Dash = () => <span className="text-dim">{DASH}</span>;
/** A dash that says why: valuation, verdict and options do not apply to an index. */
function NotForIndex() {
  const t = useTranslations("watchlist");
  return <span className="text-dim" title={t("indexNa")} aria-label={t("indexNa")}>—</span>;
}

export function useWatchlistColumns({
  onAddToPortfolio,
  onRemove,
}: {
  onAddToPortfolio: (row: WatchRow) => void;
  onRemove: (row: WatchRow) => void;
}): Column<WatchRow>[] {
  const t = useTranslations("watchlist");
  return [
    {
      key: "ticker", header: t("columnTicker"), sortable: true, sortValue: (r) => r.ticker,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">{r.ticker}</span>
          {r.isIndex && (
            <span className="rounded-full border border-protocol/50 bg-protocol-bg px-1.5 py-0.5 text-[9px] text-protocol" title={t("indexTitle")}>{t("indexChip")}</span>
          )}
          {r.isCrypto && <CryptoChip />}
          {moatStyle(r.moat).show && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${moatStyle(r.moat).badgeClass}`}>
              {r.moat}{r.moatIsAi ? " (AI)" : ""}
            </span>
          )}
          {r.enrichmentStatus === "pending" && (
            <span className="animate-pulse rounded-full bg-signal-caution/10 px-1.5 py-0.5 text-[9px] text-signal-caution">{t("pending")}</span>
          )}
          {r.enrichmentStatus === "processing" && (
            <span className="animate-pulse rounded-full bg-signal/10 px-1.5 py-0.5 text-[9px] text-signal">{t("enriching")}</span>
          )}
          {r.hasThoughts && (
            <span title={t("thoughtsAvailable")}><Brain className="h-3 w-3 text-signal/60" aria-label={t("thoughtsAvailable")} /></span>
          )}
        </span>
      ),
    },
    {
      key: "name", header: t("columnName"), sortable: true, sortValue: (r) => r.name?.toLowerCase(), hideBelow: "md",
      cell: (r) => <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{r.name || DASH}</span>,
    },
    {
      key: "sector", header: t("columnSector"), sortable: true, sortValue: (r) => r.sectorGroup?.toLowerCase(), hideBelow: "sm",
      cell: (r) => r.sector ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Building2 className="h-2.5 w-2.5 text-dim" aria-hidden="true" />{r.sector}{r.sectorIsAi ? " (AI)" : ""}
        </span>
      ) : <Dash />,
    },
    {
      key: "industry", header: t("columnIndustry"), sortable: true, sortValue: (r) => r.industry?.toLowerCase(), hideBelow: "lg",
      cell: (r) => <span className="text-[11px] text-muted-foreground">{r.industry || DASH}</span>,
    },
    {
      key: "price", header: t("columnPrice"), sortable: true, sortValue: (r) => r.price, align: "right",
      cell: (r) => r.price != null && r.price > 0 ? (
        <span className="flex flex-col items-end">
          <LivePrice price={r.price} currency="$" live={r.livePrice != null} className="text-sm text-foreground" />
          {r.livePrice == null && r.lastPriceUpdatedAt && (
            <span className={`font-mono text-[10px] ${isStale(r.lastPriceUpdatedAt) ? "text-signal-caution" : "text-dim"}`}>
              {relativeAge(new Date(r.lastPriceUpdatedAt).getTime())}
            </span>
          )}
        </span>
      ) : <Dash />,
    },
    {
      key: "mos", header: t("mos"), sortable: true, sortValue: (r) => r.mos, align: "right",
      cell: (r) => r.isIndex ? <NotForIndex /> : r.isCrypto ? <CryptoNa /> : r.mos != null ? (
        <span className={`nums inline-flex items-center justify-end gap-0.5 font-mono text-xs ${signTextClass(r.mos)}`}>
          {r.mos > 0 ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
          {formatMoS(r.mos)}
        </span>
      ) : <Dash />,
    },
    {
      key: "fairValue", header: t("fairValue"), sortable: true, sortValue: (r) => r.fairValue, align: "right", hideBelow: "lg",
      cell: (r) => r.isIndex ? <NotForIndex /> : r.isCrypto ? <CryptoNa /> : r.fairValue != null ? <span className="nums font-mono text-xs text-muted-foreground">${r.fairValue.toFixed(2)}</span> : <Dash />,
    },
    {
      key: "aiMos", header: t("mosAi"), sortable: true, sortValue: (r) => r.aiMos, align: "right", hideBelow: "lg",
      cell: (r) => r.isIndex ? <NotForIndex /> : r.isCrypto ? <CryptoNa /> : r.aiMos != null ? <span className={`nums font-mono text-xs ${signTextClass(r.aiMos)}`}>{formatMoS(r.aiMos)}</span> : <Dash />,
    },
    {
      key: "trend", header: t("trend"), sortable: true, sortValue: (r) => (r.trend ? TREND_RANK[r.trend] ?? null : null), align: "right", hideBelow: "md",
      cell: (r) => r.trend ? (
        <span className={`text-xs ${directionTextClass(normalizeDirection(r.trend))}`}>
          {r.trend === "up" ? "↑" : r.trend === "down" ? "↓" : "→"} Q
        </span>
      ) : <Dash />,
    },
    {
      key: "verdict", header: t("columnVerdict"), sortable: true, sortValue: (r) => (r.verdict?.state ? VERDICT_RANK[r.verdict.state] ?? null : null),
      cell: (r) => r.isIndex ? <NotForIndex /> : r.verdict?.state ? <VerdictBadge state={r.verdict.state} size="sm" /> : <Dash />,
    },
    {
      key: "pam", header: t("columnPam"), sortable: true, sortValue: (r) => (r.pam?.setup ? `${r.pam.direction ?? "z"}-${r.pam.setup}` : null), hideBelow: "md",
      cell: (r) => <PamBadge pam={r.pam} />,
    },
    {
      key: "swing", header: "Swing L / H", ariaLabel: "Nearest weekly swing low and swing high", align: "right", hideBelow: "md",
      cell: (r) => <SwingCell swing={r.pam ? { low: r.pam.swing_low ?? null, high: r.pam.swing_high ?? null } : null} />,
    },
    {
      key: "opt", header: t("columnOption"), sortable: true, sortValue: (r) => r.opt?.strategy ?? null, hideBelow: "md",
      cell: (r) => r.isIndex ? <NotForIndex /> : r.isCrypto ? <CryptoNa /> : r.opt?.strategy ? (
        <span
          title={r.opt.conviction != null ? `${(r.opt.conviction * 100).toFixed(0)}% conviction` : undefined}
          className="inline-block rounded-full border border-signal/30 bg-signal-bg px-1.5 py-0.5 font-mono text-[10px] text-signal"
        >
          {r.opt.strategy}
        </span>
      ) : <Dash />,
    },
    {
      key: "actions", header: <span className="sr-only">{t("remove")}</span>, ariaLabel: t("remove"), align: "right",
      cell: (r) => (
        <span className="flex items-center justify-end gap-1">
          {!r.isIndex && (
          <button
            type="button"
            onClick={() => onAddToPortfolio(r)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-signal-bg hover:text-signal"
            title={t("addToPortfolioTitle")}
            aria-label={t("addToPortfolioTitle")}
          >
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(r)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-signal-short-bg hover:text-signal-short"
            aria-label={t("remove")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      ),
    },
  ];
}
