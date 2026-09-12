"use client";

/**
 * The treemap itself: d3-hierarchy for the layout, plain positioned divs for
 * the tiles (text on a div wraps, clips and styles like the rest of the app;
 * text in SVG does not), one tooltip for every parameter of the hovered name.
 *
 * Colour is resolved from the CSS signal tokens at render time, so the map
 * follows the theme toggle. A tile whose colour metric is missing renders
 * hatched — never zero, never the midpoint colour — because 262 of the 518
 * index names have no signals and painting them neutral would be a lie.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { hierarchy, treemap, treemapSquarify, hsl as d3hsl, lab as d3lab, scaleLinear, interpolateLab } from "d3";
import {
  type GroupKey, type HeatmapRow, type Metric, type SizeKey, type Tone,
  STRATEGY_LABEL, fmtCap, groupOf, sizeOf,
} from "@/lib/heatmap";

// ── Theme tokens → colours ────────────────────────────────────────────────

type Palette = Record<Tone | "divMid" | "seqLo" | "seqHi" | "ink" | "inkOnDark", string>;

function readToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return raw || "#888888";
  return d3hsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100).formatHex();
}

function readPalette(): Palette {
  // The signal tokens are tuned as TEXT colours: green-800 on the light
  // ground, green-400 on the dark one. As a fill over half the viewport the
  // dark-theme steps are far too bright, so in dark mode every signal tone is
  // pulled down towards the ground before it becomes a tile. Light mode is
  // used as-is — the deep steps read as fills already.
  const dark = document.documentElement.classList.contains("dark");
  const fill = (name: string) => {
    const c = readToken(name);
    return dark ? d3lab(c).darker(1).formatHex() : c;
  };
  return {
    long: fill("--signal-long"),
    "long-strong": fill("--signal-long-strong"),
    short: fill("--signal-short"),
    "short-strong": fill("--signal-short-strong"),
    neutral: fill("--signal-neutral"),
    conflict: fill("--signal-conflict"),
    caution: fill("--signal-caution"),
    divMid: readToken("--border"),
    seqLo: readToken("--muted"),
    seqHi: readToken("--primary"),
    ink: readToken("--foreground"),
    inkOnDark: "#ffffff",
  };
}

function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return v;
}

function colorFor(metric: Metric, pal: Palette): (v: number | string) => string {
  if (metric.kind === "cat") return (v) => pal[metric.tone(String(v))];
  if (metric.kind === "div") {
    const mid = metric.mid ?? (metric.lo + metric.hi) / 2;
    const s = scaleLinear<string>().domain([metric.lo, mid, metric.hi])
      .range([pal.short, pal.divMid, pal.long]).interpolate(interpolateLab).clamp(true);
    return (v) => s(Number(v));
  }
  const s = scaleLinear<string>().domain([metric.lo, metric.hi])
    .range([pal.seqLo, pal.seqHi]).interpolate(interpolateLab).clamp(true);
  return (v) => s(Number(v));
}

function inkFor(bg: string, pal: Palette): string {
  const l = d3lab(bg)?.l ?? 50;
  return l > 62 ? "#13151c" : pal.inkOnDark;
}

const pct = (d: number) => (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

// ── Layout ────────────────────────────────────────────────────────────────

interface Leaf { r: HeatmapRow; x0: number; y0: number; x1: number; y1: number }
interface Group { name: string; n: number; wchg: number | null; x0: number; y0: number; x1: number; y1: number; leaves: Leaf[] }

function layout(rows: HeatmapRow[], group: GroupKey, size: SizeKey, w: number, h: number): Group[] {
  if (!rows.length || w < 10 || h < 10) return [];
  const byGroup = new Map<string, HeatmapRow[]>();
  for (const r of rows) {
    const g = groupOf(r, group);
    (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(r);
  }
  type Node = { name: string; row?: HeatmapRow; children?: Node[] };
  const rootData: Node = {
    name: "root",
    children: [...byGroup].map(([name, kids]) => ({ name, children: kids.map((r) => ({ name: r.ticker, row: r })) })),
  };
  const floor = size === "equal" ? 1 : size === "weight" ? 0.01 : size === "expected_move" ? 0.5 : 1e8;
  const root = treemap<Node>().size([w, h]).paddingOuter(3).paddingTop(group === "none" ? 3 : 17)
    .paddingInner(1.5).tile(treemapSquarify.ratio(1.1)).round(true)(
      hierarchy<Node>(rootData)
        .sum((d) => (d.row ? Math.max(sizeOf(d.row, size), floor) : 0))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    );

  return (root.children ?? []).map((g) => {
    const leaves = g.leaves().map((l) => ({ r: l.data.row!, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 }));
    const capSum = leaves.reduce((s, l) => s + (l.r.market.market_cap ?? 0), 0);
    const wchg = capSum > 0
      ? leaves.reduce((s, l) => s + (l.r.market.chg_1d ?? 0) * (l.r.market.market_cap ?? 0), 0) / capSum
      : null;
    return { name: g.data.name, n: leaves.length, wchg, x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, leaves };
  });
}

// ── Tooltip content ───────────────────────────────────────────────────────

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (v == null || v === "") return null;
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="nums font-mono text-right">{v}</dd>
    </>
  );
}

function TooltipBody({ r, asOf }: { r: HeatmapRow; asOf: { signals?: string | null; options?: string | null } }) {
  const m = r.market, s = r.signals, o = r.options;
  const f = (v: number | null | undefined, d = 1, suffix = "") => (v == null ? null : `${v.toFixed(d)}${suffix}`);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-mono font-semibold text-base">{r.ticker}</span>
        <span className="text-[11px] text-muted-foreground truncate">{r.sector}{r.sub_industry ? ` · ${r.sub_industry}` : ""}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-2 truncate">{r.name}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <Row k="Price" v={m.price != null ? `$${m.price.toFixed(2)}` : null} />
        <Row k="Day" v={m.chg_1d != null ? pct(2)(m.chg_1d) : null} />
        <Row k="1W / 1M / 3M" v={[m.ret_1w, m.ret_1m, m.ret_3m].some((x) => x != null)
          ? [m.ret_1w, m.ret_1m, m.ret_3m].map((x) => (x == null ? "—" : pct(1)(x))).join(" / ") : null} />
        <Row k="YTD / 12M" v={m.ret_ytd != null || m.ret_12m != null
          ? `${m.ret_ytd == null ? "—" : pct(1)(m.ret_ytd)} / ${m.ret_12m == null ? "—" : pct(1)(m.ret_12m)}` : null} />
        <Row k="From 52w high" v={m.pct_from_52w_high != null ? pct(1)(m.pct_from_52w_high) : null} />
        <Row k="Market cap" v={fmtCap(m.market_cap)} />
        <Row k="Rel. volume" v={f(m.rel_volume, 2, "×")} />
        <Row k="Indices" v={[r.indices.includes("SPX") ? `S&P 500${r.weight.SPX != null ? ` ${r.weight.SPX.toFixed(2)}%` : ""}` : null, r.indices.includes("NDX") ? "Nasdaq-100" : null].filter(Boolean).join(", ") || "book only"} />
        <Row k="Next earnings" v={m.next_earnings} />
        {s && (
          <>
            <Row k="Verdict" v={s.verdict ? `${s.verdict.replace("_", " ")} · ${(s.verdict_score ?? 0) >= 0 ? "+" : ""}${(s.verdict_score ?? 0).toFixed(2)} · conf ${((s.verdict_confidence ?? 0) * 100).toFixed(0)}%` : null} />
            <Row k="Price action" v={s.pam ? [s.pam.setup, s.pam.direction_label].filter(Boolean).join(" · ") || null : null} />
            <Row k="PAM conviction" v={f(s.pam?.conviction, 0)} />
            <Row k="Ranked book" v={s.ranked?.composite_z != null ? `z ${s.ranked.composite_z >= 0 ? "+" : ""}${s.ranked.composite_z.toFixed(2)} · p${s.ranked.percentile?.toFixed(0)} · ${s.ranked.bucket ?? ""}` : null} />
            <Row k="Ensemble 3M" v={s.ensemble_3m_pct != null ? `${pct(1)(s.ensemble_3m_pct)}${s.prob_profit_pct != null ? ` · POP ${s.prob_profit_pct.toFixed(0)}%` : ""}` : null} />
            <Row k="GARCH vol" v={s.garch_vol != null ? `${(s.garch_vol * 100).toFixed(0)}%` : null} />
            <Row k="Moat" v={s.moat} />
            <Row k="Margin of safety" v={s.margin_of_safety != null ? `${s.margin_of_safety >= 0 ? "+" : ""}${(s.margin_of_safety * 100).toFixed(0)}%` : null} />
            <Row k="F-score / Altman Z" v={s.f_score != null || s.altman_z != null ? `${s.f_score ?? "—"} / ${s.altman_z != null ? s.altman_z.toFixed(1) : "—"}` : null} />
            <Row k="10-year range" v={s.range_10y != null ? `${(s.range_10y * 100).toFixed(0)}%` : null} />
            <Row k="Trend Q / Y" v={s.quarterly_trend || s.yearly_trend ? `${s.quarterly_trend ?? "—"} / ${s.yearly_trend ?? "—"}` : null} />
          </>
        )}
        {o && (
          <>
            <Row k="IV rank / ATM IV" v={`${o.iv_rank != null ? o.iv_rank.toFixed(0) : "—"} / ${o.atm_iv != null ? `${o.atm_iv.toFixed(0)}%` : "—"}`} />
            <Row k="Expected move 30d" v={o.expected_move_30d != null ? `±${o.expected_move_30d.toFixed(1)}%` : null} />
            <Row k="Put/call OI" v={f(o.pcr_oi, 2)} />
            <Row k="Options call" v={o.strategy ? `${STRATEGY_LABEL[o.strategy]} · conv ${((o.conviction ?? 0) * 100).toFixed(0)}%${o.annualized_return_pct != null ? ` · ${o.annualized_return_pct.toFixed(0)}% ann.` : ""}` : null} />
          </>
        )}
      </dl>
      <div className="mt-2 pt-1.5 border-t border-dashed border-border text-[11px] text-muted-foreground">
        {r.tier === "signals"
          ? `Signals as of ${asOf.signals ? new Date(asOf.signals).toLocaleString() : "—"}${o ? ` · options ${asOf.options ? new Date(asOf.options).toLocaleDateString() : "—"}` : ""}`
          : "Market tier only. Not in the enriched book."}
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function Treemap({
  rows, group, size, metric, universeIsIndex, asOf, height = 640,
}: {
  rows: HeatmapRow[];
  group: GroupKey;
  size: SizeKey;
  metric: Metric;
  /** ring the enriched names when an index is being viewed */
  universeIsIndex: boolean;
  asOf: { signals?: string | null; options?: string | null };
  height?: number;
}) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const themeVersion = useThemeVersion();
  const [hover, setHover] = useState<{ r: HeatmapRow; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const pal = useMemo(() => (typeof window === "undefined" ? null : readPalette()), [themeVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = useMemo(() => (pal ? colorFor(metric, pal) : null), [metric, pal]);
  const groups = useMemo(() => layout(rows, group, size, width, height), [rows, group, size, width, height]);

  const onMove = (r: HeatmapRow) => (e: ReactMouseEvent) => setHover({ r, x: e.clientX, y: e.clientY });
  const tipStyle = useMemo(() => {
    if (!hover || typeof window === "undefined") return undefined;
    const W = 320, H = 440, pad = 14;
    const x = hover.x + pad + W > window.innerWidth ? hover.x - W - pad : hover.x + pad;
    const y = hover.y + pad + H > window.innerHeight ? Math.max(8, hover.y - H - pad) : hover.y + pad;
    return { left: x, top: y, width: W } as const;
  }, [hover]);

  return (
    <div className="relative">
      <div
        ref={hostRef}
        role="img"
        aria-label={`Treemap of ${rows.length} names grouped by ${group}, coloured by ${metric.label}`}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-background"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {groups.map((g) => (
          <div key={g.name} className="absolute overflow-hidden" style={{ left: g.x0, top: g.y0, width: g.x1 - g.x0, height: g.y1 - g.y0 }}>
            {group !== "none" && (
              <div
                className="absolute left-1 top-0 max-w-[calc(100%-8px)] truncate font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground"
                title={g.name}
              >
                {g.name} · {g.n}{g.wchg != null ? ` · ${pct(2)(g.wchg)}` : ""}
              </div>
            )}
          </div>
        ))}
        {groups.flatMap((g) =>
          g.leaves.map((l) => {
            const w = l.x1 - l.x0, h = l.y1 - l.y0;
            if (w < 1 || h < 1) return null;
            const v = metric.value(l.r);
            const has = v != null && v !== "";
            const bg = has && color ? color(v as number | string) : undefined;
            const ring = universeIsIndex && l.r.tier === "signals";
            const fontSize = Math.max(9, Math.min(18, Math.min(w / 4, h / 2.2)));
            return (
              <button
                key={l.r.ticker}
                type="button"
                onMouseMove={onMove(l.r)}
                onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); setHover({ r: l.r, x: b.right, y: b.top }); }}
                onBlur={() => setHover(null)}
                onClick={() => router.push(`/stock/${l.r.ticker}`)}
                aria-label={`${l.r.ticker}${has ? `, ${metric.label} ${metric.fmt(v as never)}` : ", no data for this metric"}`}
                className={`absolute flex flex-col items-center justify-center overflow-hidden rounded-[2px] text-center leading-none hover:z-10 hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-foreground focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                  has ? "" : "heatmap-nodata text-muted-foreground"
                }`}
                style={{
                  left: l.x0, top: l.y0, width: w, height: h,
                  background: bg,
                  color: bg && pal ? inkFor(bg, pal) : undefined,
                  boxShadow: ring ? "inset 0 0 0 1px hsl(var(--primary) / 0.7)" : undefined,
                }}
              >
                {w >= 22 && h >= 14 && (
                  <span className="font-mono font-semibold" style={{ fontSize }}>{l.r.ticker}</span>
                )}
                {has && w >= 44 && h >= 34 && (
                  <span className="mt-0.5 font-mono text-[11px] opacity-90">{metric.fmt(v as never)}</span>
                )}
              </button>
            );
          }),
        )}
      </div>

      {hover && tipStyle && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-lg border border-border bg-card p-3 text-foreground shadow-lg"
          style={tipStyle}
        >
          <TooltipBody r={hover.r} asOf={asOf} />
        </div>
      )}
    </div>
  );
}

export function Legend({ metric }: { metric: Metric }) {
  const themeVersion = useThemeVersion();
  const pal = useMemo(() => (typeof window === "undefined" ? null : readPalette()), [themeVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pal) return null;
  const color = colorFor(metric, pal);
  if (metric.kind === "cat") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {metric.cats.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5 font-mono text-[11px]">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color(c) }} />
            {metric.fmt(c as never)}
          </span>
        ))}
      </div>
    );
  }
  const stops = Array.from({ length: 11 }, (_, i) => color(metric.lo + (i / 10) * (metric.hi - metric.lo)));
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="nums">{metric.fmt(metric.lo as never)}</span>
      <div aria-hidden="true" className="h-2.5 w-32 rounded-[3px] border border-border" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <span className="nums">{metric.fmt(metric.hi as never)}</span>
    </div>
  );
}
