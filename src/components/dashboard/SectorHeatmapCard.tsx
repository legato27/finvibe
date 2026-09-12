"use client";

/**
 * Sector heatmap — the dashboard's view of the market heatmap, one tile per
 * GICS sector sized by total market cap and coloured by cap-weighted change
 * over the chosen window. Reads GET /api/heatmap/sectors (about 2 KB) rather
 * than the full composition, and every tile links into /heatmap with that
 * sector pre-selected.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { hierarchy, treemap, treemapSquarify } from "d3";
import { ArrowUpRight } from "lucide-react";
import { heatmapApi } from "@/lib/api";
import { fmtCap } from "@/lib/heatmap";
import { divergingScale, inkFor, usePalette } from "@/components/heatmap/palette";
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

// Labels for tiles too narrow for the full GICS name. The name outranks the
// number on a small tile: the number is one hover away, the name is not.
const SHORT: Record<string, string> = {
  "Information Technology": "Info Tech",
  "Communication Services": "Comm. Svcs",
  "Consumer Discretionary": "Discretionary",
  "Consumer Staples": "Staples",
  "Health Care": "Health",
  "Real Estate": "Real Est.",
  "Industrials": "Industrials",
};

const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);

interface Tile { s: SectorRow; x0: number; y0: number; x1: number; y1: number }

function layout(rows: SectorRow[], w: number, h: number): Tile[] {
  if (!rows.length || w < 10 || h < 10) return [];
  type Node = { name: string; row?: SectorRow; children?: Node[] };
  const root = treemap<Node>().size([w, h]).paddingInner(2).tile(treemapSquarify.ratio(1.3)).round(true)(
    hierarchy<Node>({ name: "root", children: rows.map((s) => ({ name: s.sector, row: s })) })
      .sum((d) => (d.row ? Math.max(d.row.market_cap, 1e9) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
  );
  return root.leaves().map((l) => ({ s: l.data.row!, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 }));
}

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
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const HEIGHT = 200;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [data]);

  const w = WINDOWS.find((x) => x.key === win)!;
  const color = useMemo(() => (pal ? divergingScale(pal, w.lo, w.hi, 0) : null), [pal, w]);
  const rows = useMemo(() => (data?.sectors ?? []).filter((s) => s.sector !== "Unclassified"), [data]);
  const tiles = useMemo(() => layout(rows, width, HEIGHT), [rows, width]);
  const market = useMemo(() => {
    const capSum = rows.reduce((a, s) => a + s.market_cap, 0);
    const v = rows.reduce((a, s) => a + (s[win] ?? 0) * s.market_cap, 0);
    return capSum ? v / capSum : null;
  }, [rows, win]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title flex items-center gap-1">
          {t("sectorHeatmap")}
          <InfoTip tip={t("sectorHeatmapInfo")} />
        </span>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border/40 p-0.5" role="group" aria-label={t("sectorHeatmapWindow")}>
            {WINDOWS.map((x) => (
              <button key={x.key} type="button" aria-pressed={win === x.key} onClick={() => setWin(x.key)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${win === x.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {x.label}
              </button>
            ))}
          </div>
          <Link href="/heatmap" className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">
            {t("sectorHeatmapOpen")}<ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm animate-pulse py-8 text-center">{t("sectorHeatmapLoading")}</div>}
      {error && <div className="text-danger text-sm py-8 text-center">{t("sectorHeatmapError")}</div>}

      {data && (
        <>
          <div ref={hostRef} className="relative w-full overflow-hidden rounded-lg" style={{ height: HEIGHT }}>
            {tiles.map(({ s, x0, y0, x1, y1 }) => {
              const tw = x1 - x0, th = y1 - y0;
              const v = s[win];
              const bg = v != null && color ? color(v) : undefined;
              const ink = bg && pal ? inkFor(bg, pal) : undefined;
              const label = SHORT[s.sector] ?? s.sector;
              return (
                <Link
                  key={s.sector}
                  href={`/heatmap?sector=${encodeURIComponent(s.sector)}`}
                  title={`${s.sector} · ${s.n} names · ${fmtCap(s.market_cap)} · ${s.advancers}▲ ${s.decliners}▼ · ${s.n_long} long / ${s.n_short} short verdicts`}
                  className={`absolute flex flex-col items-center justify-center overflow-hidden rounded-[3px] text-center leading-tight hover:z-10 hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${bg ? "" : "heatmap-nodata text-muted-foreground"}`}
                  style={{ left: x0, top: y0, width: tw, height: th, background: bg, color: ink }}
                >
                  {tw >= 34 && th >= 22 && (
                    <span className="px-1 text-[11px] font-semibold truncate max-w-full">{tw >= 150 ? s.sector : label}</span>
                  )}
                  {tw >= 48 && th >= 40 && (
                    <span className="font-mono text-[11px] nums opacity-90">{pct(v, win === "chg_1d" ? 2 : 1)}</span>
                  )}
                  {tw >= 90 && th >= 58 && (
                    <span className="font-mono text-[9.5px] nums opacity-75">{s.n} · {s.advancers}▲ {s.decliners}▼</span>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              {t("sectorHeatmapMarket", { window: w.label })}{" "}
              <span className={`nums font-mono ${market == null ? "" : market >= 0 ? "text-signal-long" : "text-signal-short"}`}>{pct(market, win === "chg_1d" ? 2 : 1)}</span>
            </span>
            <span>{t("sectorHeatmapNames", { count: data.count })}</span>
            <LastUpdated at={data.as_of?.market} label={t("sectorHeatmapAsOf")} className="ml-auto" />
          </div>
        </>
      )}
    </div>
  );
}
