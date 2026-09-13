"use client";

/**
 * Sector rotation — where each sector sits against the market and which
 * way it is moving. Two views on one Panel: the quadrant chart (default),
 * built in the browser from six months of the eleven sector ETFs and SPY,
 * and the table with the windowed returns, RS rank and the regime-
 * conditioned 60-day forward figure for the expert. One sentence under
 * either view names the leaders, the improvers and the laggards.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { heatmapApi, macroApi, stocksApi } from "@/lib/api";
import { groupByQuadrant, relativeRotation, type Quadrant } from "@/lib/rotation";
import Panel, { PanelPending } from "@/components/ui/Panel";
import Segmented from "@/components/ui/Segmented";
import Chip from "@/components/ui/Chip";
import RotationQuadrant, { type QuadrantSector } from "@/components/dashboard/RotationQuadrant";
import { InfoTip } from "@/components/shared/InfoTip";

const WINDOWS = [
  { key: "perf_1m", label: "1M" },
  { key: "perf_3m", label: "3M" },
  { key: "perf_6m", label: "6M" },
  { key: "perf_12m", label: "12M" },
] as const;

const BENCH = "SPY";
const PERIOD = "6mo";
const INTERVAL = "1d";

/** Sector ETF → GICS sector, for cap lookup on the heatmap rollup. The
 *  rotation rows use a shorter vendor taxonomy ("Technology"). */
const ETF_GICS: Record<string, string> = {
  XLK: "Information Technology", XLY: "Consumer Discretionary", XLF: "Financials", XLI: "Industrials",
  XLB: "Materials", XLRE: "Real Estate", XLC: "Communication Services", XLE: "Energy",
  XLV: "Health Care", XLP: "Consumer Staples", XLU: "Utilities",
};

const QUADRANTS: Quadrant[] = ["leading", "improving", "weakening", "lagging"];
const QUADRANT_CHIP: Record<Quadrant, "signal" | "protocol" | "caution" | "short"> = {
  leading: "signal", improving: "protocol", weakening: "caution", lagging: "short",
};

/** Cell tint: sign picks the hue, magnitude picks the alpha step. Ink stays
 *  the page foreground so it reads on every step in both themes; the sign is
 *  also in the text, so the hue is never the only carrier. */
function perfCellClass(value: number | undefined): string {
  if (value === undefined || value === null) return "bg-muted text-muted-foreground";
  if (value >= 10) return "bg-signal-long/60 text-foreground";
  if (value >= 5) return "bg-signal-long/45 text-foreground";
  if (value >= 2) return "bg-signal-long/30 text-foreground";
  if (value >= 0) return "bg-signal-long/15 text-foreground";
  if (value >= -2) return "bg-signal-short/15 text-foreground";
  if (value >= -5) return "bg-signal-short/30 text-foreground";
  if (value >= -10) return "bg-signal-short/45 text-foreground";
  return "bg-signal-short/60 text-foreground";
}

function forecastClass(value: number | undefined): string {
  if (value == null) return "text-muted-foreground";
  if (value >= 8) return "text-signal-long";
  if (value >= 4) return "text-signal-long-strong";
  if (value >= 0) return "text-signal-caution";
  if (value >= -3) return "text-signal-short";
  return "text-signal-break";
}

function rankClass(rank: number): string {
  return rank <= 3 ? "text-signal-long" : rank >= 9 ? "text-signal-short" : "text-signal-neutral";
}

const shortName = (s: string) => s.replace("Consumer ", "Con. ").replace("Communication ", "Comm. ");

type HistoryResponse = { data?: Array<Record<string, unknown>> };
function closesOf(res: HistoryResponse | undefined) {
  if (!res?.data) return [];
  return res.data.map((row) => ({
    time: String(row.Date ?? row.date ?? "").slice(0, 10),
    close: Number(row.Close ?? row.close ?? 0),
  }));
}

export function SectorRotationHeatmap() {
  const t = useTranslations("dashboard");
  const tr = useTranslations("dashboard.rotation");
  const sectorRotation = useAppStore((s) => s.macro.sectorRotation);
  const [view, setView] = useState<"quadrant" | "table">("quadrant");

  // Regime-conditioned sector forecast (table view).
  const { data: regimeData } = useQuery({
    queryKey: ["regime_sectors"],
    queryFn: macroApi.regimeSectors,
    staleTime: 60_000 * 10,
  });

  // Caps for dot size, from the heatmap rollup the sector card already reads.
  const { data: sectorsData } = useQuery<{ sectors: Array<{ sector: string; market_cap: number }> }>({
    queryKey: ["heatmap-sectors"],
    queryFn: heatmapApi.sectors,
    staleTime: 60_000,
  });

  const rows = useMemo(() => sectorRotation ?? [], [sectorRotation]);
  const tickers = useMemo(() => (rows.length ? [...rows.map((r) => r.etf_ticker), BENCH] : []), [rows]);
  const histories = useQueries({
    queries: tickers.map((tk) => ({
      queryKey: ["price_history", tk, PERIOD, INTERVAL],
      queryFn: () => stocksApi.priceHistory(tk, PERIOD, INTERVAL) as Promise<HistoryResponse>,
      staleTime: 10 * 60_000,
      retry: 1,
    })),
  });
  const historyData = histories.map((q) => q.data);
  const historiesPending = histories.some((q) => q.isPending);

  const quadrantSectors = useMemo<QuadrantSector[]>(() => {
    if (historiesPending || !rows.length) return [];
    const bench = closesOf(historyData[tickers.indexOf(BENCH)]);
    if (!bench.length) return [];
    const caps = new Map((sectorsData?.sectors ?? []).map((s) => [s.sector, s.market_cap]));
    const out: QuadrantSector[] = [];
    rows.forEach((r, i) => {
      const rr = relativeRotation(closesOf(historyData[i]), bench);
      if (!rr) return;
      out.push({
        key: r.etf_ticker,
        label: r.etf_ticker,
        name: r.sector,
        size: caps.get(ETF_GICS[r.etf_ticker] ?? "") ?? 1,
        current: rr.current,
        trail: rr.trail,
        quadrant: rr.quadrant,
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tickers, historiesPending, sectorsData, ...historyData]);

  const groups = useMemo(() => groupByQuadrant(quadrantSectors), [quadrantSectors]);
  const quadrantLabels = useMemo(
    () => Object.fromEntries(QUADRANTS.map((q) => [q, tr(`quadrant.${q}` as never)])) as Record<Quadrant, string>,
    [tr],
  );

  const label = (
    <span className="flex items-center gap-1">
      {t("sectorRotation")}
      <InfoTip tip={view === "quadrant" ? tr("quadrantInfo") : t("sectorRotationInfo")} />
    </span>
  );
  const aside = (
    <div className="flex items-center gap-2">
      <Segmented
        mode="toggle"
        size="sm"
        ariaLabel={tr("viewLabel")}
        value={view}
        onChange={setView}
        options={[
          { value: "quadrant", label: tr("viewQuadrant") },
          { value: "table", label: tr("viewTable") },
        ]}
      />
      <Link href="/heatmap?group=sector" className="hidden items-center gap-0.5 text-[11px] text-signal hover:underline sm:inline-flex">
        {t("sectorHeatmapOpen")}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );

  if (!rows.length) return <PanelPending label={label} text={t("sectorLoading")} />;

  // The sentence: leaders, improvers, laggards, by sector name.
  const names = (q: Quadrant) => groups[q].map((s) => shortName(s.name));
  const sentences: string[] = [];
  if (quadrantSectors.length) {
    if (groups.leading.length) sentences.push(tr("readingLead", { list: joinList(names("leading")) }));
    if (groups.improving.length) sentences.push(tr("readingImproving", { list: joinList(names("improving")) }));
    if (groups.weakening.length) sentences.push(tr("readingWeakening", { list: joinList(names("weakening")) }));
    if (groups.lagging.length) sentences.push(tr("readingLagging", { list: joinList(names("lagging")) }));
  }
  if (regimeData?.top_3?.length) {
    sentences.push(tr("readingRegime", { regime: regimeData.regime, favors: regimeData.top_3.join(", "), avoids: (regimeData.bottom_3 ?? []).join(", ") }));
  }

  return (
    <Panel
      label={label}
      qualifier={regimeData ? t("sectorRegimeBadge", { regime: regimeData.regime }) : undefined}
      aside={aside}
      reading={sentences.join(" ")}
    >
      {view === "quadrant" ? (
        <>
          {historiesPending ? (
            <div role="status" className="aspect-[8/5] w-full animate-pulse rounded-control bg-muted" />
          ) : quadrantSectors.length ? (
            <RotationQuadrant
              sectors={quadrantSectors}
              ariaLabel={tr("ariaChart")}
              labels={quadrantLabels}
              axisX={tr("axisX")}
              axisY={tr("axisY")}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{tr("noHistories")}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {QUADRANTS.map((q) => (
              <Chip key={q} tone={QUADRANT_CHIP[q]}>
                <span className="font-mono">{quadrantLabels[q]} · {groups[q].length}</span>
              </Chip>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">{tr("trailNote")}</span>
          </div>
        </>
      ) : (
        <RotationTable rows={rows} regimeData={regimeData} />
      )}
    </Panel>
  );
}

function RotationTable({
  rows,
  regimeData,
}: {
  rows: NonNullable<ReturnType<typeof useAppStore.getState>["macro"]["sectorRotation"]>;
  regimeData: { regime: string; forecasts?: Array<{ sector: string; expected_return: number }>; top_3?: string[]; bottom_3?: string[] } | undefined;
}) {
  const t = useTranslations("dashboard");
  const forecastMap: Record<string, number> = {};
  for (const f of regimeData?.forecasts ?? []) forecastMap[f.sector] = f.expected_return;

  const sorted = [...rows].sort((a, b) => {
    const fa = forecastMap[a.sector] ?? -Infinity;
    const fb = forecastMap[b.sector] ?? -Infinity;
    if (fa !== -Infinity || fb !== -Infinity) return fb - fa;
    return (a.rs_rank || 11) - (b.rs_rank || 11);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="w-36 pb-2 pr-2 text-left font-normal">{t("sectorColSector")}</th>
            <th className="px-1 pb-2 text-center font-normal">{t("sectorColEtf")}</th>
            {regimeData && (
              <th className="w-16 pb-2 pl-1 text-center font-normal" title={t("sectorColFwdTitle")}>
                {t("sectorColFwd")}
              </th>
            )}
            {WINDOWS.map(({ label }) => (
              <th key={label} className="w-14 px-1 pb-2 text-center font-normal">{label}</th>
            ))}
            <th className="pb-2 pl-1 text-center font-normal">{t("sectorColRank")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const forecast = forecastMap[row.sector];
            return (
              <tr key={row.sector} className="border-t border-border/30">
                <td className="max-w-[140px] truncate py-1 pr-2 font-medium text-foreground" title={row.sector}>
                  {shortName(row.sector)}
                </td>
                <td className="px-1 py-1 text-center font-mono text-muted-foreground">{row.etf_ticker}</td>
                {regimeData && (
                  <td className="py-1 pl-1 text-center">
                    {forecast != null ? (
                      <span
                        className={`font-mono text-[11px] font-bold ${forecastClass(forecast)}`}
                        title={t("sectorFwdTitle", { regime: regimeData.regime, sector: row.sector, forecast })}
                      >
                        {forecast >= 0 ? "+" : ""}{forecast.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                {WINDOWS.map(({ key }) => {
                  const val = row[key];
                  return (
                    <td key={key} className={`rounded px-1 py-1 text-center font-mono ${perfCellClass(val)}`}>
                      {val !== undefined && val !== null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                    </td>
                  );
                })}
                <td className="py-1 pl-1 text-center">
                  <span className={`font-mono font-bold ${rankClass(row.rs_rank || 11)}`}>
                    #{Math.round(row.rs_rank || 11)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {regimeData && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-signal">{t("sectorLegendFwd")}</span> {t("sectorLegendDesc")}{" "}
          <span className="text-signal">{regimeData.regime}</span> {t("sectorLegendRegimes")}
        </p>
      )}
    </div>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
