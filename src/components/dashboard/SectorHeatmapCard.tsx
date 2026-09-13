"use client";

/**
 * Sector heatmap — the dashboard's view of the market heatmap: one equal
 * tile per GICS sector, coloured by cap-weighted change over the chosen
 * window and ordered leader first. Equal tiles, not cap-sized: on a card
 * this wide a cap-weighted treemap gave Utilities a 40px sliver with a
 * 9px label, and a sector you cannot read is a sector you cannot act on.
 * The cap share survives as the thin bar under each name; the cap-sized
 * treemap lives on /heatmap, one click away, and every tile links there
 * with its sector pre-selected. Reads GET /api/heatmap/sectors (~2 KB).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { heatmapApi } from "@/lib/api";
import { fmtCap } from "@/lib/heatmap";
import { divergingScale, inkFor, usePalette } from "@/components/heatmap/palette";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Segmented from "@/components/ui/Segmented";
import { InfoTip } from "@/components/shared/InfoTip";
import { LastUpdated } from "@/components/common/LastUpdated";

interface SectorRow {
  sector: string;
  n: number;
  n_signals: number;
  market_cap: number;
  chg_1d: number | null;
  ret_1w: number | null;
  ret_1m: number | null;
  ret_ytd: number | null;
  advancers: number;
  decliners: number;
  n_long: number;
  n_short: number;
}
interface SectorsResponse {
  as_of: { market: string | null; signals: string | null };
  count: number;
  sectors: SectorRow[];
}

type WindowKey = "chg_1d" | "ret_1w" | "ret_1m" | "ret_ytd";
const WINDOWS: Array<{ key: WindowKey; label: string; lo: number; hi: number }> = [
  { key: "chg_1d", label: "Day", lo: -2, hi: 2 },
  { key: "ret_1w", label: "1W", lo: -5, hi: 5 },
  { key: "ret_1m", label: "1M", lo: -10, hi: 10 },
  { key: "ret_ytd", label: "YTD", lo: -25, hi: 25 },
];

// Phone-width labels; the full GICS name shows from `sm` up and in the title.
const SHORT: Record<string, string> = {
  "Information Technology": "Info Tech",
  "Communication Services": "Comm. Svcs",
  "Consumer Discretionary": "Discretionary",
  "Consumer Staples": "Staples",
  "Health Care": "Health",
  "Real Estate": "Real Estate",
};

const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);

export function SectorHeatmapCard() {
  const t = useTranslations("dashboard");
  const { data, isLoading, error } = useQuery<SectorsResponse>({
    queryKey: ["heatmap-sectors"],
    queryFn: heatmapApi.sectors,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const [win, setWin] = useState<WindowKey>("chg_1d");
  const pal = usePalette();

  const w = WINDOWS.find((x) => x.key === win)!;
  const decimals = win === "chg_1d" ? 2 : 1;
  const color = useMemo(() => (pal ? divergingScale(pal, w.lo, w.hi, 0) : null), [pal, w]);
  const rows = useMemo(
    () =>
      (data?.sectors ?? [])
        .filter((s) => s.sector !== "Unclassified")
        .sort((a, b) => (b[win] ?? -Infinity) - (a[win] ?? -Infinity)),
    [data, win],
  );
  const capMax = useMemo(() => rows.reduce((m, s) => Math.max(m, s.market_cap), 0), [rows]);
  const capSum = useMemo(() => rows.reduce((a, s) => a + s.market_cap, 0), [rows]);
  const market = useMemo(() => {
    const v = rows.reduce((a, s) => a + (s[win] ?? 0) * s.market_cap, 0);
    return capSum ? v / capSum : null;
  }, [rows, win, capSum]);

  const label = (
    <span className="flex items-center gap-1">
      {t("sectorHeatmap")}
      <InfoTip tip={t("sectorHeatmapInfo")} />
    </span>
  );
  const aside = (
    <div className="flex items-center gap-2">
      <Segmented
        mode="toggle"
        size="sm"
        ariaLabel={t("sectorHeatmapWindow")}
        value={win}
        onChange={setWin}
        options={WINDOWS.map((x) => ({ value: x.key, label: x.label }))}
      />
      {/* Hidden on a phone: every tile already links into the heatmap. */}
      <Link href="/heatmap" className="hidden items-center gap-0.5 text-[11px] text-signal hover:underline sm:inline-flex">
        {t("sectorHeatmapOpen")}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );

  if (isLoading) return <PanelPending label={label} text={t("sectorHeatmapLoading")} />;
  if (error || !data || !rows.length) return <PanelUnavailable label={label} aside={aside} reason={t("sectorHeatmapError")} />;

  const scored = rows.filter((s) => s[win] != null);
  const up = scored.filter((s) => (s[win] ?? 0) > 0).length;
  const leader = scored[0];
  const laggard = scored[scored.length - 1];
  const reading =
    leader && laggard && leader !== laggard
      ? t("sectorHeatmapReading", {
          up,
          total: scored.length,
          window: w.label,
          leader: leader.sector,
          leadPct: pct(leader[win], decimals),
          laggard: laggard.sector,
          lagPct: pct(laggard[win], decimals),
        })
      : t("sectorHeatmapReadingShort", { up, total: scored.length, window: w.label });

  return (
    <Panel label={label} qualifier={t("sectorHeatmapNames", { count: data.count })} aside={aside} reading={reading}>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4" aria-label={t("sectorHeatmap")}>
        {rows.map((s) => {
          const v = s[win];
          const bg = v != null && color ? color(v) : undefined;
          const ink = bg && pal ? inkFor(bg, pal) : undefined;
          const share = capMax ? s.market_cap / capMax : 0;
          const sharePct = capSum ? (100 * s.market_cap) / capSum : 0;
          return (
            <li key={s.sector} className="min-w-0">
              <Link
                href={`/heatmap?sector=${encodeURIComponent(s.sector)}`}
                title={`${s.sector} · ${s.n} names · ${fmtCap(s.market_cap)} · ${s.advancers}▲ ${s.decliners}▼ · ${s.n_long} long / ${s.n_short} short verdicts`}
                className={`flex h-full flex-col gap-0.5 rounded-control px-2.5 py-2 leading-tight hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${bg ? "" : "heatmap-nodata text-muted-foreground"}`}
                style={{ background: bg, color: ink }}
              >
                <span className="truncate text-[12px] font-semibold">
                  <span className="sm:hidden">{SHORT[s.sector] ?? s.sector}</span>
                  <span className="hidden sm:inline">{s.sector}</span>
                </span>
                <span className="nums font-mono text-lg font-bold">{pct(v, decimals)}</span>
                <span className="nums font-mono text-[10px] opacity-80">
                  {s.n} · {s.advancers}▲ {s.decliners}▼
                </span>
                {/* Track and fill are siblings: a child's opacity cannot exceed its parent's. */}
                <span className="relative mt-1 block h-[3px] w-full" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-current opacity-20" />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-current" style={{ width: `${Math.max(4, share * 100)}%` }} />
                </span>
                <span className="sr-only">{t("sectorHeatmapCapShare", { pct: sharePct.toFixed(0) })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {t("sectorHeatmapMarket", { window: w.label })}{" "}
          <span className={`nums font-mono ${market == null ? "" : market >= 0 ? "text-signal-long" : "text-signal-short"}`}>{pct(market, decimals)}</span>
        </span>
        <span>{t("sectorHeatmapBarNote")}</span>
        <LastUpdated at={data.as_of?.market} label={t("sectorHeatmapAsOf")} className="ml-auto" />
      </div>
    </Panel>
  );
}
