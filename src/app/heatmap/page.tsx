"use client";

/**
 * Market heatmap — every S&P 500 and Nasdaq-100 name as a tile, sized by
 * market cap, coloured by any FinVibe signal, grouped by sector / verdict /
 * price-action read / options strategy, filtered by verdict, sector, cap band,
 * IV rank, earnings proximity and watchlist.
 *
 * One endpoint feeds it (GET /api/heatmap, see docs/heatmap-design.md); the
 * treemap, the table view and the tooltip share the metric table in
 * src/lib/heatmap.ts so they never disagree about a number.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { heatmapApi } from "@/lib/api";
import {
  CAP_BANDS, GICS_SECTORS, GROUPS, METRICS, METRIC_BY_KEY, SIZES, VERDICTS, VERDICT_TONE,
  type GroupKey, type HeatmapResponse, type HeatmapRow, type SizeKey, type Universe,
  daysUntil, fmtCap, inUniverse,
} from "@/lib/heatmap";
import { Treemap, Legend } from "@/components/heatmap/Treemap";
import DataTable, { type Column } from "@/components/ui/DataTable";
import VerdictBadge from "@/components/ui/VerdictBadge";
import GuideCard from "@/components/ui/GuideCard";
import { InfoTip } from "@/components/shared/InfoTip";
import { LastUpdated } from "@/components/common/LastUpdated";
import { ScreenerTabs } from "@/components/shared/ScreenerTabs";
import { WatchlistStar } from "@/components/shared/WatchlistStar";
import { WatchlistPicklist, watchlistTickerSet, ALL_WATCHLISTS } from "@/components/shared/WatchlistPicklist";
import type { FilterDef } from "@/components/shared/ColumnFilters";
import { useWatchlistGroups } from "@/lib/supabase/hooks";

const TONE_DOT: Record<string, string> = {
  long: "bg-signal-long", "long-strong": "bg-signal-long-strong",
  short: "bg-signal-short", "short-strong": "bg-signal-short-strong",
  neutral: "bg-signal-neutral", conflict: "bg-signal-conflict", caution: "bg-signal-caution",
};

const selectCls =
  "rounded-md border border-border/30 bg-muted/50 px-2 py-1 text-xs text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/50";
const inputCls = `${selectCls} w-20 nums`;

function Chip({ on, onClick, children, dot }: { on: boolean; onClick: () => void; children: React.ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors ${
        on ? "border-primary bg-primary/15 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {dot && <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-[2px] ${dot}`} />}
      {children}
    </button>
  );
}

function useIsNarrow(px = 640): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return narrow;
}

export default function HeatmapPage() {
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <HeatmapPageInner />
    </Suspense>
  );
}

const UNIVERSES: Universe[] = ["both", "spx", "ndx", "book"];

function HeatmapPageInner() {
  const t = useTranslations("heatmap");
  // Deep links from the dashboard sector card: /heatmap?sector=Energy&universe=spx
  const params = useSearchParams();
  const initialSector = params.get("sector");
  const initialUniverse = params.get("universe");

  const { data, isLoading, error, refetch, isFetching } = useQuery<HeatmapResponse>({
    queryKey: ["heatmap"],
    queryFn: () => heatmapApi.get(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: watchlistGroups } = useWatchlistGroups();
  const [watchlist, setWatchlist] = useState<string>(ALL_WATCHLISTS);
  const wlSet = watchlistTickerSet(watchlistGroups, watchlist);

  const [universe, setUniverse] = useState<Universe>(
    UNIVERSES.includes(initialUniverse as Universe) ? (initialUniverse as Universe) : "both",
  );
  const [group, setGroup] = useState<GroupKey>("sector");
  const [size, setSize] = useState<SizeKey>("cap");
  const [metricKey, setMetricKey] = useState<string>("chg_1d");
  const [verdicts, setVerdicts] = useState<Set<string>>(new Set());
  const [sectors, setSectors] = useState<Set<string>>(
    () => new Set(initialSector && (GICS_SECTORS as readonly string[]).includes(initialSector) ? [initialSector] : []),
  );
  const [capBand, setCapBand] = useState("");
  const [ivMin, setIvMin] = useState("");
  const [earnDays, setEarnDays] = useState("");
  const [enrichedOnly, setEnrichedOnly] = useState(false);
  const [view, setView] = useState<"map" | "table">("map");
  const narrow = useIsNarrow();
  const showTable = narrow || view === "table";

  const metric = METRIC_BY_KEY[metricKey] ?? METRICS[0];

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const ivFloor = ivMin.trim() === "" ? null : Number(ivMin);
    const earnWithin = earnDays.trim() === "" ? null : Number(earnDays);
    return all.filter((r) => {
      if (!inUniverse(r, universe)) return false;
      if (wlSet && !wlSet.has(r.ticker)) return false;
      if (enrichedOnly && r.tier !== "signals") return false;
      if (verdicts.size && !verdicts.has(r.signals?.verdict ?? "")) return false;
      if (sectors.size && !sectors.has(r.sector ?? "")) return false;
      if (capBand && r.market.cap_band !== capBand) return false;
      if (ivFloor != null && !(r.options?.iv_rank != null && r.options.iv_rank >= ivFloor)) return false;
      if (earnWithin != null) {
        const d = daysUntil(r.market.next_earnings);
        if (d == null || d < 0 || d > earnWithin) return false;
      }
      return true;
    });
  }, [data, universe, wlSet, enrichedOnly, verdicts, sectors, capBand, ivMin, earnDays]);

  const withMetric = useMemo(() => rows.filter((r) => metric.value(r) != null).length, [rows, metric]);
  const capShown = useMemo(() => rows.reduce((s, r) => s + (r.market.market_cap ?? 0), 0), [rows]);

  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  // ── Table view (also the mobile view) ────────────────────────────────
  const tableFilters: FilterDef<HeatmapRow>[] = [
    { key: "ticker", label: "Ticker", kind: "text", value: (r) => r.ticker },
    { key: "name", label: "Name", kind: "text", value: (r) => r.name ?? "" },
  ];
  const columns: Column<HeatmapRow>[] = [
    { key: "ticker", header: "Ticker", sortable: true, sortValue: (r) => r.ticker,
      cell: (r) => <span className="font-mono font-semibold text-primary">{r.ticker}</span> },
    { key: "watch", header: <span className="sr-only">Watchlist</span>, ariaLabel: "Watchlist", cell: (r) => <WatchlistStar ticker={r.ticker} /> },
    { key: "name", header: "Name", hideBelow: "md", cell: (r) => <span className="text-muted-foreground truncate max-w-[180px] inline-block align-bottom">{r.name ?? "—"}</span> },
    { key: "sector", header: "Sector", optional: true, sortable: true, sortValue: (r) => r.sector ?? "", cell: (r) => <span className="text-muted-foreground">{r.sector ?? "—"}</span> },
    { key: "cap", header: "Cap", align: "right", sortable: true, sortValue: (r) => r.market.market_cap ?? -1, cell: (r) => <span className="font-mono">{fmtCap(r.market.market_cap)}</span> },
    { key: "chg", header: "Day", align: "right", sortable: true, sortValue: (r) => r.market.chg_1d ?? null,
      cell: (r) => r.market.chg_1d == null ? <span className="text-muted-foreground">—</span> : (
        <span className={`font-mono ${r.market.chg_1d >= 0 ? "text-signal-long" : "text-signal-short"}`}>{r.market.chg_1d >= 0 ? "+" : ""}{r.market.chg_1d.toFixed(2)}%</span>
      ) },
    { key: "metric", header: metric.label, ariaLabel: metric.label, align: "right", sortable: true,
      sortValue: (r) => { const v = metric.value(r); return v == null ? null : (typeof v === "number" ? v : String(v)); },
      cell: (r) => { const v = metric.value(r); return v == null ? <span className="text-muted-foreground">—</span> : <span className="font-mono">{metric.fmt(v as never)}</span>; } },
    { key: "verdict", header: "Verdict", sortable: true, sortValue: (r) => r.signals?.verdict ?? "",
      cell: (r) => r.signals?.verdict ? <VerdictBadge state={r.signals.verdict} size="sm" /> : <span className="text-[11px] text-muted-foreground">{t("notEnriched")}</span> },
    { key: "ivr", header: "IV rank", align: "right", optional: true, sortable: true, sortValue: (r) => r.options?.iv_rank ?? null,
      cell: (r) => <span className="font-mono text-muted-foreground">{r.options?.iv_rank != null ? r.options.iv_rank.toFixed(0) : "—"}</span> },
    { key: "earn", header: "Earnings", optional: true, sortable: true, sortValue: (r) => r.market.next_earnings ?? "",
      cell: (r) => <span className="font-mono text-muted-foreground">{r.market.next_earnings ?? "—"}</span> },
  ];

  const asOfMarket = data?.as_of.market;

  return (
    <div className="space-y-4 max-w-[1240px] mx-auto">
      <ScreenerTabs />
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <div className="flex items-center gap-3">
            <LastUpdated at={asOfMarket} label={t("marketAsOf")} />
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label={t("refresh")}
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              {t("refresh")}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">{t("subtitle")}</p>
      </div>

      <GuideCard
        title={t("guideTitle")}
        intro={t("guideIntro")}
        sections={[
          { title: t("guideAxesTitle"), tone: "plain", steps: [t("guideAxes1"), t("guideAxes2"), t("guideAxes3"), t("guideAxes4")] },
          { title: t("guideReadTitle"), tone: "plain", steps: [t("guideRead1"), t("guideRead2"), t("guideRead3")] },
        ]}
        footnote={t("guideFootnote")}
      />

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">{t("loading")}</div>}
      {error && <div className="card p-6 text-sm text-danger">{t("loadError")}</div>}

      {data && (
        <>
          {/* ── Controls ─────────────────────────────────────────────── */}
          <div className="card space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("universe")}
                <select value={universe} onChange={(e) => setUniverse(e.target.value as Universe)} className={selectCls}>
                  <option value="both">S&amp;P 500 + Nasdaq-100</option>
                  <option value="spx">S&amp;P 500</option>
                  <option value="ndx">Nasdaq-100</option>
                  <option value="book">{t("universeBook")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("group")}
                <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)} className={selectCls}>
                  {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("size")}
                <select value={size} onChange={(e) => setSize(e.target.value as SizeKey)} className={selectCls}>
                  {SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("color")}
                <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className={selectCls}>
                  {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("capBand")}
                <select value={capBand} onChange={(e) => setCapBand(e.target.value)} className={selectCls}>
                  <option value="">{t("all")}</option>
                  {CAP_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("coverage")}
                <select value={enrichedOnly ? "1" : ""} onChange={(e) => setEnrichedOnly(e.target.value === "1")} className={selectCls}>
                  <option value="">{t("coverageAll")}</option>
                  <option value="1">{t("coverageEnriched")}</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <WatchlistPicklist groups={watchlistGroups} value={watchlist} onChange={setWatchlist} />
              <label className="flex items-center gap-1.5 text-muted-foreground">
                {t("minIvRank")}
                <input type="number" inputMode="numeric" min={0} max={100} step={5} value={ivMin} placeholder={t("any")}
                  onChange={(e) => setIvMin(e.target.value)} className={inputCls} />
              </label>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                {t("earningsWithin")}
                <input type="number" inputMode="numeric" min={0} max={120} value={earnDays} placeholder={t("any")}
                  onChange={(e) => setEarnDays(e.target.value)} className={inputCls} />
                <span>{t("days")}</span>
              </label>
              {!narrow && (
                <div className="ml-auto inline-flex rounded-md border border-border/40 p-0.5">
                  {(["map", "table"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                      className={`rounded px-2.5 py-0.5 text-xs ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {t(v)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("verdict")}</span>
              {VERDICTS.map((v) => (
                <Chip key={v} on={verdicts.has(v)} onClick={() => toggle(verdicts, v, setVerdicts)} dot={TONE_DOT[VERDICT_TONE[v]]}>
                  {v.replace("_", " ")}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("sector")}</span>
              {GICS_SECTORS.map((s) => (
                <Chip key={s} on={sectors.has(s)} onClick={() => toggle(sectors, s, setSectors)}>{s}</Chip>
              ))}
              {(verdicts.size > 0 || sectors.size > 0) && (
                <button type="button" onClick={() => { setVerdicts(new Set()); setSectors(new Set()); }}
                  className="ml-1 text-xs text-muted-foreground hover:text-foreground">
                  {t("clear")}
                </button>
              )}
            </div>
          </div>

          {/* ── Status line ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><span className="nums font-mono text-foreground">{rows.length}</span> {t("tiles")}</span>
            <span><span className="nums font-mono text-foreground">{withMetric}</span> {t("withMetric", { metric: metric.label })}</span>
            <span><span className="nums font-mono text-foreground">{fmtCap(capShown)}</span> {t("capShown")}</span>
            <span className="inline-flex items-center gap-1">
              <InfoTip label={metric.short} tip={metric.tip} size={11} />
            </span>
            <span className="ml-auto"><Legend metric={metric} /></span>
          </div>

          {/* ── The map, or the table ────────────────────────────────── */}
          {rows.length === 0 ? (
            <div className="card p-6 text-sm text-muted-foreground">{t("empty")}</div>
          ) : showTable ? (
            <DataTable
              caption={t("tableCaption")}
              columns={columns}
              rows={rows}
              rowKey={(r) => r.ticker}
              rowHref={(r) => `/stock/${r.ticker}`}
              filters={tableFilters}
              defaultSort={{ key: "metric", dir: "desc" }}
              emptyText={t("empty")}
            />
          ) : (
            <Treemap
              rows={rows}
              group={group}
              size={size}
              metric={metric}
              universeIsIndex={universe !== "book"}
              asOf={{ signals: data.as_of.signals, options: data.as_of.options }}
              height={640}
            />
          )}

          <p className="text-[11px] text-muted-foreground">
            {t("footnote", {
              signals: data.tiers.signals,
              market: data.tiers.market,
              spx: data.indices.SPX ?? 0,
              ndx: data.indices.NDX ?? 0,
            })}
          </p>
        </>
      )}
    </div>
  );
}
