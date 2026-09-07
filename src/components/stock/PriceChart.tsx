"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { stocksApi } from "@/lib/api";
import { Download, Pencil, X, Loader2, Maximize2, Minimize2 } from "lucide-react";
import {
  computeVolumeProfile, sliceByDays,
  type VolumeProfile, type VpBar,
} from "@/lib/volumeProfile";

// ── Types ────────────────────────────────────────────────────

type Period   = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y";
type Interval = "1d"  | "1wk" | "1mo";
type ChartMode = "candle" | "line";

interface OhlcvState {
  time:   string;
  open?:  number;
  high?:  number;
  low?:   number;
  close:  number;
  volume: number;
}

type CandleRow = VpBar;

// ── Constants ────────────────────────────────────────────────

const PERIODS: [Period, string][] = [
  ["1mo", "period1mo"], ["3mo", "period3mo"], ["6mo", "period6mo"],
  ["1y", "period1y"], ["2y", "period2y"], ["5y", "period5y"], ["10y", "periodMax"],
];

const INTERVALS: [Interval, string][] = [
  ["1d", "intervalDay"], ["1wk", "intervalWeek"], ["1mo", "intervalMonth"],
];

/** Volume-profile lookback windows, in calendar days. 0 = every loaded bar. */
const VP_WINDOWS: [number, string][] = [[188, "188D"], [365, "1Y"], [0, "All"]];

/** Price bands the profile is cut into. */
const VP_ROWS = 48;

/** Share of the plot width the longest (POC) bar occupies. */
const VP_WIDTH_FRAC = 0.30;

/** Bands thinner than this on screen get merged with their neighbours. */
const VP_MIN_BAND_PX = 3;

const VP_COLORS = {
  outside: "rgba(100, 116, 139, 0.32)",  // slate-500 — outside the value area
  inside:  "rgba(148, 163, 184, 0.52)",  // slate-400 — inside the value area
  poc:     "rgba(250, 204, 21, 0.60)",   // amber — point of control
  pocLine: "rgba(250, 204, 21, 0.45)",
  pocText: "rgba(250, 204, 21, 0.92)",
  buy:     "rgba(34, 197, 94, 0.42)",
  sell:    "rgba(239, 68, 68, 0.42)",
};

// ── Helpers ──────────────────────────────────────────────────

function computeMA(data: CandleRow[], period: number): { time: string; value: number }[] {
  const out: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

function fmtVol(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + "K";
  return v.toFixed(0);
}

// ── Component ────────────────────────────────────────────────

export function PriceChart({ ticker, priceAction, currentPrice }: { ticker: string; priceAction?: any; currentPrice?: number }) {
  const t = useTranslations('stock');
  // ── DOM + chart refs ──────────────────────────────────────
  const containerRef  = useRef<HTMLDivElement>(null);
  const vpCanvasRef   = useRef<HTMLCanvasElement>(null);
  const chartRef      = useRef<any>(null);
  const mainSeriesRef = useRef<any>(null);
  const volSeriesRef  = useRef<any>(null);
  const ma20Ref       = useRef<any>(null);
  const ma50Ref       = useRef<any>(null);
  const ma200Ref      = useRef<any>(null);
  const drawLinesRef  = useRef<{ line: any; price: number }[]>([]);

  // ── UI state ──────────────────────────────────────────────
  const [period,    setPeriod]    = useState<Period>("1y");
  const [interval,  setInterval_] = useState<Interval>("1d");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [showMA20,  setShowMA20]  = useState(true);
  const [showMA50,  setShowMA50]  = useState(true);
  const [showMA200, setShowMA200] = useState(false);
  const [showVP,    setShowVP]    = useState(true);
  const [vpWindow,  setVpWindow]  = useState(188);
  const [vpSplit,   setVpSplit]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [drawMode,  setDrawMode]  = useState(false);
  const [chartReady, setChartReady] = useState(false); // flips true once the (re)built chart's series exists
  const [ohlcv,     setOhlcv]     = useState<OhlcvState | null>(null);
  const [periodChg, setPeriodChg] = useState<number | null>(null);

  // Keep draw-mode ref in sync so the click closure always reads latest value
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;

  // Refs for MA visibility so chart-init closure doesn't go stale
  const showMA20Ref  = useRef(showMA20);
  const showMA50Ref  = useRef(showMA50);
  const showMA200Ref = useRef(showMA200);
  showMA20Ref.current  = showMA20;
  showMA50Ref.current  = showMA50;
  showMA200Ref.current = showMA200;

  const drawKey = `chart_drawings_${ticker}`;

  // ── Data ─────────────────────────────────────────────────
  const { data: priceData, isLoading } = useQuery({
    queryKey: ["price_history", ticker, period, interval],
    queryFn:  () => stocksApi.priceHistory(ticker, period, interval),
    staleTime: 60_000,
    // No refetchInterval: the live forming bar (driven by the hero's polled
    // currentPrice) conveys the live level without rebuilding the chart every
    // minute, which would reset the user's zoom/pan.
  });

  const chartData = useMemo<CandleRow[]>(() => {
    if (!priceData?.data) return [];
    return (priceData.data as any[])
      .map((row) => ({
        time:   String(row.Date ?? row.date ?? "").slice(0, 10),
        open:   +(row.Open  ?? row.open  ?? row.Close ?? row.close ?? 0),
        high:   +(row.High  ?? row.high  ?? row.Close ?? row.close ?? 0),
        low:    +(row.Low   ?? row.low   ?? row.Close ?? row.close ?? 0),
        close:  +(row.Close ?? row.close ?? 0),
        volume: +(row.Volume ?? row.volume ?? 0),
      }))
      .filter((d) => d.time.length >= 10 && d.close > 0)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [priceData?.data]);

  // ── Volume profile ───────────────────────────────────────
  // Volume-by-price over the lookback window. The window is measured in
  // calendar days, not bars, so "188D" covers the same stretch of history
  // whether the chart is drawn daily, weekly or monthly.
  const profile = useMemo<VolumeProfile | null>(() => {
    if (!showVP || chartData.length === 0) return null;
    const window = vpWindow > 0 ? sliceByDays(chartData, vpWindow) : chartData;
    const p = computeVolumeProfile(window, VP_ROWS);
    return p.maxTotal > 0 ? p : null;
  }, [showVP, chartData, vpWindow]);

  // ── Build / Rebuild chart whenever data or mode changes ──
  useEffect(() => {
    if (!containerRef.current || chartData.length === 0) return;

    let cancelled = false;
    setChartReady(false);

    import("lightweight-charts").then(
      ({ createChart, CrosshairMode, LineStyle, ColorType }) => {
        if (cancelled || !containerRef.current) return;

        // Destroy previous chart instance
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        drawLinesRef.current = [];

        const chart = createChart(containerRef.current!, {
          width:  containerRef.current!.clientWidth,
          height: containerRef.current!.clientHeight || 320,
          layout: {
            background: { type: ColorType.Solid, color: "#0a0a12" },
            textColor: "#64748b",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "#1e293b" },
            horzLines: { color: "#1e293b" },
          },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: "#1e293b" },
          timeScale: {
            borderColor: "#1e293b",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartRef.current = chart;

        // ── Volume histogram (bottom 20 % of chart) ──
        const volSeries = chart.addHistogramSeries({
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
        });
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
          visible: false,
        });
        volSeries.setData(
          chartData.map((d) => ({
            time:  d.time,
            value: d.volume,
            color: d.close >= d.open ? "#22c55e2a" : "#ef44442a",
          }))
        );
        volSeriesRef.current = volSeries;

        // ── Main price series ──
        let mainSeries: any;
        if (chartMode === "candle") {
          mainSeries = chart.addCandlestickSeries({
            upColor:         "#22c55e",
            downColor:       "#ef4444",
            borderUpColor:   "#22c55e",
            borderDownColor: "#ef4444",
            wickUpColor:     "#22c55e",
            wickDownColor:   "#ef4444",
          });
          mainSeries.setData(
            chartData.map((d) => ({
              time: d.time, open: d.open, high: d.high, low: d.low, close: d.close,
            }))
          );
        } else {
          mainSeries = chart.addLineSeries({ color: "#3b82f6", lineWidth: 2 });
          mainSeries.setData(chartData.map((d) => ({ time: d.time, value: d.close })));
        }
        mainSeriesRef.current = mainSeries;

        // ── Moving-average series ──
        const ma20S = chart.addLineSeries({
          color: "#3b82f6", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const ma50S = chart.addLineSeries({
          color: "#f97316", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const ma200S = chart.addLineSeries({
          color: "#a855f7", lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        ma20S.setData(computeMA(chartData, 20));
        ma50S.setData(computeMA(chartData, 50));
        ma200S.setData(computeMA(chartData, 200));
        ma20S.applyOptions({ visible: showMA20Ref.current });
        ma50S.applyOptions({ visible: showMA50Ref.current });
        ma200S.applyOptions({ visible: showMA200Ref.current });
        ma20Ref.current  = ma20S;
        ma50Ref.current  = ma50S;
        ma200Ref.current = ma200S;

        // ── Price Action (PAM) overlays ──
        const pa = priceAction;
        if (pa?.synthesis) {
          const kl = pa.synthesis.key_levels || {};
          const lines: { price: number; color: string; title: string }[] = [];
          if (kl.sweet_spot) {
            lines.push({ price: kl.sweet_spot.low, color: "#6366f1", title: "SS↓" });
            lines.push({ price: kl.sweet_spot.high, color: "#6366f1", title: "SS↑" });
          }
          if (kl.invalidation != null) lines.push({ price: kl.invalidation, color: "#ef4444", title: "Invalid" });
          if (kl.structural_target != null) lines.push({ price: kl.structural_target, color: "#22c55e", title: "Target" });
          Object.entries(kl.support_resistance || {}).forEach(([k, v]) => {
            if (typeof v === "number") lines.push({ price: v, color: "#64748b", title: k });
          });
          lines.forEach(({ price, color, title }) => {
            try {
              mainSeries.createPriceLine({
                price, color, lineWidth: 1, lineStyle: LineStyle.Dotted,
                axisLabelVisible: true, title,
              });
            } catch { /* ignore */ }
          });

          // Swing + FSB markers from the timeframe matching the current interval
          const tfKey = interval === "1wk" ? "weekly" : interval === "1mo" ? "monthly" : "daily";
          const tf = pa.timeframes?.[tfKey];
          if (tf) {
            const times = new Set(chartData.map((d) => d.time));
            const markers: any[] = [];
            (tf.swing_markers || []).forEach((m: any) => {
              if (!times.has(m.date)) return;
              markers.push({
                time: m.date, position: m.type === "H" ? "aboveBar" : "belowBar",
                color: m.type === "H" ? "#f87171" : "#4ade80", shape: "circle", text: m.type,
              });
            });
            (tf.fsb_markers || []).forEach((m: any) => {
              if (!times.has(m.date)) return;
              markers.push({
                time: m.date, position: m.dir === "bull" ? "belowBar" : "aboveBar",
                color: m.dir === "bull" ? "#22c55e" : "#ef4444",
                shape: m.dir === "bull" ? "arrowUp" : "arrowDown", text: "FSB",
              });
            });
            if (markers.length) {
              markers.sort((a, b) => a.time.localeCompare(b.time));
              try { mainSeries.setMarkers(markers); } catch { /* ignore */ }
            }
          }
        }

        // ── Restore saved drawings ──
        try {
          const saved: number[] = JSON.parse(localStorage.getItem(drawKey) ?? "[]");
          saved.forEach((price) => {
            const line = mainSeries.createPriceLine({
              price, color: "#f59e0b", lineWidth: 1,
              lineStyle: LineStyle.Dashed, axisLabelVisible: true,
              title: `$${price.toFixed(2)}`,
            });
            drawLinesRef.current.push({ line, price });
          });
        } catch { /* ignore */ }

        // ── Period change ──
        if (chartData.length >= 2) {
          const first = chartData[0].close;
          const last  = chartData[chartData.length - 1].close;
          setPeriodChg(((last - first) / first) * 100);
        }

        // ── Crosshair move → OHLCV display ──
        chart.subscribeCrosshairMove((param: any) => {
          if (!param?.time) { setOhlcv(null); return; }
          const md = param.seriesData?.get?.(mainSeries);
          const vd = param.seriesData?.get?.(volSeries);
          if (!md) return;
          if (chartMode === "candle") {
            setOhlcv({
              time: String(param.time),
              open: md.open, high: md.high, low: md.low, close: md.close,
              volume: vd?.value ?? 0,
            });
          } else {
            setOhlcv({ time: String(param.time), close: md.value, volume: vd?.value ?? 0 });
          }
        });

        // ── Click → draw H-line ──
        chart.subscribeClick((param: any) => {
          if (!drawModeRef.current || !param?.point) return;
          const price: number | null = mainSeries.coordinateToPrice(param.point.y);
          if (price == null) return;
          const line = mainSeries.createPriceLine({
            price, color: "#f59e0b", lineWidth: 1,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true,
            title: `$${price.toFixed(2)}`,
          });
          drawLinesRef.current.push({ line, price });
          localStorage.setItem(
            drawKey,
            JSON.stringify(drawLinesRef.current.map((d) => d.price))
          );
        });

        chart.timeScale().fitContent();
        setChartReady(true);
      }
    );

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      // Drop the series handles too: they belong to the chart that was just
      // disposed, and anything still holding one would throw on next touch.
      mainSeriesRef.current = null;
      volSeriesRef.current  = null;
      ma20Ref.current = ma50Ref.current = ma200Ref.current = null;
      drawLinesRef.current = [];
    };
  }, [chartData, chartMode, ticker, drawKey, priceAction, interval]);

  // ── MA visibility toggles (don't rebuild chart) ──────────
  useEffect(() => { ma20Ref.current?.applyOptions({ visible: showMA20 }); }, [showMA20]);
  useEffect(() => { ma50Ref.current?.applyOptions({ visible: showMA50 }); }, [showMA50]);
  useEffect(() => { ma200Ref.current?.applyOptions({ visible: showMA200 }); }, [showMA200]);

  // ── Volume-profile painting ──────────────────────────────
  // lightweight-charts has no volume-by-price series, so the profile is painted
  // on a transparent canvas sitting on top of the chart. Price → pixel goes
  // through the series' own priceToCoordinate, which keeps the bands glued to
  // the price axis through any zoom or pan.
  const drawProfile = useCallback(() => {
    const canvas    = vpCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const series = mainSeriesRef.current;
    const chart  = chartRef.current;
    if (!profile || !series || !chart) return;

    // Bars grow leftwards from the inner edge of the price scale.
    let scaleW = 0;
    try { scaleW = chart.priceScale("right").width() ?? 0; } catch { /* ignore */ }
    const rightEdge = Math.max(0, w - scaleW) - 2;
    const maxBarW   = Math.max(36, rightEdge * VP_WIDTH_FRAC);

    // How tall one band is on screen. A 188-day window on a chart zoomed out to
    // several years can squeeze all 48 bands into a sliver, where each is well
    // under a pixel and the profile reads as a grey smear. Merge neighbouring
    // bands until they are thick enough to see — the shape survives, only the
    // resolution drops, and it recovers as soon as the user zooms in.
    const bands   = profile.buckets.length;
    const yTopAll = series.priceToCoordinate(profile.buckets[bands - 1].high);
    const yBotAll = series.priceToCoordinate(profile.buckets[0].low);
    if (yTopAll == null || yBotAll == null) return;
    const bandPx = Math.abs(yBotAll - yTopAll) / bands;
    const group  = bandPx >= VP_MIN_BAND_PX ? 1 : Math.min(bands, Math.ceil(VP_MIN_BAND_PX / Math.max(bandPx, 0.01)));

    // Grouping changes what the longest bar is, so rescale against the groups.
    type Row = { low: number; high: number; buy: number; sell: number; total: number; hasPoc: boolean };
    const rows: Row[] = [];
    for (let i = 0; i < bands; i += group) {
      const chunk = profile.buckets.slice(i, i + group);
      rows.push({
        low:    chunk[0].low,
        high:   chunk[chunk.length - 1].high,
        buy:    chunk.reduce((s, b) => s + b.buy,  0),
        sell:   chunk.reduce((s, b) => s + b.sell, 0),
        total:  chunk.reduce((s, b) => s + b.total, 0),
        hasPoc: chunk.some((b) => b === profile.poc),
      });
    }
    const rowMax = rows.reduce((m, r) => Math.max(m, r.total), 0);
    if (rowMax <= 0) return;

    let pocBarW = 0;
    for (const row of rows) {
      if (row.total <= 0) continue;
      const yHigh = series.priceToCoordinate(row.high);
      const yLow  = series.priceToCoordinate(row.low);
      if (yHigh == null || yLow == null) continue;

      const top    = Math.min(yHigh, yLow);
      const height = Math.max(1, Math.abs(yLow - yHigh) - 1);
      if (top + height < 0 || top > h) continue;

      const barW = (row.total / rowMax) * maxBarW;
      if (row.hasPoc) pocBarW = barW;
      if (barW < 0.5) continue;

      if (vpSplit) {
        const buyW  = (row.buy  / rowMax) * maxBarW;
        const sellW = (row.sell / rowMax) * maxBarW;
        ctx.fillStyle = VP_COLORS.buy;
        ctx.fillRect(rightEdge - buyW, top, buyW, height);
        ctx.fillStyle = VP_COLORS.sell;
        ctx.fillRect(rightEdge - buyW - sellW, top, sellW, height);
      } else {
        const mid     = (row.low + row.high) / 2;
        const inValue = mid >= profile.vaLow && mid <= profile.vaHigh;
        ctx.fillStyle = row.hasPoc ? VP_COLORS.poc : inValue ? VP_COLORS.inside : VP_COLORS.outside;
        ctx.fillRect(rightEdge - barW, top, barW, height);
      }
    }

    // Point of control — the price the market accepted most size at.
    if (profile.poc) {
      const y = series.priceToCoordinate(profile.poc.mid);
      if (y != null) {
        ctx.save();
        ctx.strokeStyle = VP_COLORS.pocLine;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(rightEdge, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = VP_COLORS.pocText;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`POC ${profile.poc.mid.toFixed(2)}`, rightEdge - pocBarW - 6, y - 1);
      }
    }
  }, [profile, vpSplit]);

  // Repaint whenever the price↔pixel mapping moves. lightweight-charts fires no
  // event for a vertical price-scale drag, so a cheap rAF poll compares where
  // two reference prices land and only repaints when something actually moved.
  useEffect(() => {
    if (!chartReady) return;
    if (!profile) { drawProfile(); return; }

    let raf = 0;
    let sig = "";
    const first = profile.buckets[0];
    const last  = profile.buckets[profile.buckets.length - 1];

    const tick = () => {
      const series = mainSeriesRef.current;
      const container = containerRef.current;
      if (series && container) {
        try {
          const a = series.priceToCoordinate(first.mid);
          const b = series.priceToCoordinate(last.mid);
          const next = `${a}|${b}|${container.clientWidth}|${container.clientHeight}`;
          if (next !== sig) { sig = next; drawProfile(); }
        } catch { /* chart torn down mid-frame */ }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chartReady, profile, drawProfile]);

  // ── Live last bar — the parquet's last candle is the prior session's close.
  // Overlay the hero's polled live price as the current/forming bar so the
  // chart's latest point reflects the live price, not the last close. Gated on
  // chartReady because the chart is built via an async import(); without it this
  // effect runs before the series exists and never re-fires.
  useEffect(() => {
    if (!chartReady) return;
    const series = mainSeriesRef.current;
    if (!series || currentPrice == null || chartData.length === 0) return;
    const last = chartData[chartData.length - 1];
    // Daily: start a forming bar at today if it's past the last bar; otherwise
    // (and for weekly/monthly) extend the current bar's close to the live price.
    const today = new Date().toISOString().slice(0, 10);
    const liveTime = interval === "1d" && today > last.time ? today : last.time;
    const sameBar = liveTime === last.time;
    try {
      if (chartMode === "candle") {
        const open = sameBar ? last.open : last.close;
        series.update({
          time: liveTime,
          open,
          high: Math.max(open, currentPrice, sameBar ? last.high : open),
          low:  Math.min(open, currentPrice, sameBar ? last.low  : open),
          close: currentPrice,
        });
      } else {
        series.update({ time: liveTime, value: currentPrice });
      }
    } catch { /* ignore */ }
  }, [currentPrice, chartReady, chartMode, interval, chartData]);

  // ── Resize observer ──────────────────────────────────────
  // Height is tracked as well as width: expanding to full screen changes the
  // container's height only, and the chart has to follow it.
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        try {
          chartRef.current.applyOptions({
            width:  containerRef.current.clientWidth,
            height: containerRef.current.clientHeight || 320,
          });
        } catch { /* chart torn down mid-resize */ }
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Expanded mode: escape to close, and don't scroll the page behind it ──
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  // ── Actions ──────────────────────────────────────────────
  const clearDrawings = useCallback(() => {
    drawLinesRef.current.forEach(({ line }) => {
      try { mainSeriesRef.current?.removePriceLine(line); } catch { /* ignore */ }
    });
    drawLinesRef.current = [];
    localStorage.removeItem(drawKey);
  }, [drawKey]);

  const saveChart = useCallback(() => {
    if (!chartRef.current) return;
    try {
      const canvas = chartRef.current.takeScreenshot() as HTMLCanvasElement;
      // takeScreenshot only knows about the library's own canvases, so paste the
      // volume-profile overlay on top before exporting.
      const overlay = vpCanvasRef.current;
      let out = canvas;
      if (overlay && overlay.width > 0) {
        const merged = document.createElement("canvas");
        merged.width  = canvas.width;
        merged.height = canvas.height;
        const ctx = merged.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, 0);
          ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
          out = merged;
        }
      }
      const a = document.createElement("a");
      a.download = `${ticker}-${period}-${interval}.png`;
      a.href = out.toDataURL("image/png");
      a.click();
    } catch (e) {
      console.error("Screenshot failed:", e);
    }
  }, [ticker, period, interval]);

  // ── Derived display ───────────────────────────────────────
  const isPositive = (periodChg ?? 0) >= 0;

  // ── Render ────────────────────────────────────────────────
  const card = (
    <div className={`card ${expanded ? "h-full flex flex-col overflow-hidden" : ""}`}>
      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="flex items-center gap-3">
          <span className="card-title text-sm">{t('priceChart')}</span>
          {periodChg !== null && (
            <span className={`text-sm font-mono font-semibold ${isPositive ? "text-signal-long" : "text-signal-short"}`}>
              {isPositive ? "+" : ""}{periodChg.toFixed(2)}%
            </span>
          )}
          {drawMode && (
            <span className="text-xs text-warning animate-pulse">
              {t('drawHint')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setDrawMode((m) => !m)}
            title={t('drawHLineTitle')}
            className={`p-1 rounded transition-colors ${drawMode ? "text-warning bg-warning/10" : "text-muted-foreground hover:text-primary"}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearDrawings}
            title={t('clearDrawingsTitle')}
            className="p-1 rounded text-muted-foreground hover:text-signal-short transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={saveChart}
            title={t('savePngTitle')}
            className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? t('collapseChartTitle') : t('expandChartTitle')}
            aria-pressed={expanded}
            className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
          >
            {expanded
              ? <Minimize2 className="w-3.5 h-3.5" />
              : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── OHLCV crosshair readout ────────────────────────── */}
      <div className="h-4 flex gap-3 px-1 mb-1 text-[10px] font-mono text-muted-foreground">
        {ohlcv ? (
          <>
            <span className="text-muted-foreground">{ohlcv.time}</span>
            {ohlcv.open !== undefined && (
              <>
                <span>O <span className="text-foreground">{ohlcv.open.toFixed(2)}</span></span>
                <span>H <span className="text-foreground">{ohlcv.high!.toFixed(2)}</span></span>
                <span>L <span className="text-foreground">{ohlcv.low!.toFixed(2)}</span></span>
              </>
            )}
            <span>C <span className="text-foreground">{ohlcv.close.toFixed(2)}</span></span>
            {ohlcv.volume > 0 && (
              <span>V <span className="text-foreground">{fmtVol(ohlcv.volume)}</span></span>
            )}
          </>
        ) : (
          <span>{t('hoverToInspect')}</span>
        )}
      </div>

      {/* ── Chart container ───────────────────────────────── */}
      <div className={`relative ${expanded ? "flex-1 min-h-0" : ""}`}>
        <div
          ref={containerRef}
          style={expanded ? undefined : { height: 320 }}
          className={`w-full ${expanded ? "h-full" : ""} ${drawMode ? "cursor-crosshair" : ""}`}
        />
        {/* The library paints its series on canvases at z-index 1–2, so the
            profile overlay has to sit above them to be visible at all. */}
        <canvas
          ref={vpCanvasRef}
          aria-hidden="true"
          className="absolute inset-0 z-10 pointer-events-none"
        />
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a12]/60 rounded">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* ── Controls bar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-border">

        {/* Period selector */}
        <div className="flex gap-px bg-background rounded p-0.5">
          {PERIODS.map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 text-xs rounded transition-colors
                ${period === p
                  ? "bg-primary text-background font-bold"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {/* Interval selector */}
        <div className="flex gap-px bg-background rounded p-0.5">
          {INTERVALS.map(([iv, label]) => (
            <button
              key={iv}
              onClick={() => setInterval_(iv)}
              className={`px-2 py-0.5 text-xs rounded transition-colors
                ${interval === iv
                  ? "bg-primary text-background font-bold"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex gap-px bg-background rounded p-0.5">
          {(["candle", "line"] as ChartMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              className={`px-2 py-0.5 text-xs rounded transition-colors capitalize
                ${chartMode === m
                  ? "bg-primary text-background font-bold"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "candle" ? t('candle') : t('line')}
            </button>
          ))}
        </div>

        {/* MA toggles */}
        <div className="flex items-center gap-1 ml-auto">
          {[
            { key: "ma20",  show: showMA20,  toggle: () => setShowMA20((v) => !v),  color: "#3b82f6", label: "MA20"  },
            { key: "ma50",  show: showMA50,  toggle: () => setShowMA50((v) => !v),  color: "#f97316", label: "MA50"  },
            { key: "ma200", show: showMA200, toggle: () => setShowMA200((v) => !v), color: "#a855f7", label: "MA200" },
          ].map(({ key, show, toggle, color, label }) => (
            <button
              key={key}
              onClick={toggle}
              aria-pressed={show}
              className={`text-[11px] px-2 py-0.5 rounded border transition-all inline-flex items-center gap-1 ${
                show ? "text-foreground" : "text-muted-foreground border-border"
              }`}
              style={show ? { borderColor: color + "88", backgroundColor: color + "18" } : undefined}
            >
              <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Volume-profile controls ───────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mt-1.5">
        <button
          onClick={() => setShowVP((v) => !v)}
          aria-pressed={showVP}
          title={t('volumeProfileTitle')}
          className={`text-[11px] px-2 py-0.5 rounded border transition-all inline-flex items-center gap-1 ${
            showVP
              ? "text-foreground border-slate-400/60 bg-slate-400/10"
              : "text-muted-foreground border-border"
          }`}
        >
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-sm bg-slate-400" />
          {t('volumeProfile')}
        </button>

        {showVP && (
          <>
            <div className="flex gap-px bg-background rounded p-0.5">
              {VP_WINDOWS.map(([days, label]) => (
                <button
                  key={label}
                  onClick={() => setVpWindow(days)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors
                    ${vpWindow === days
                      ? "bg-primary text-background font-bold"
                      : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setVpSplit((v) => !v)}
              aria-pressed={vpSplit}
              className={`text-[11px] px-2 py-0.5 rounded border transition-all ${
                vpSplit
                  ? "text-foreground border-primary/60 bg-primary/10"
                  : "text-muted-foreground border-border"
              }`}
            >
              {t('vpBuySellSplit')}
            </button>

            {profile && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {t('vpSummary', {
                  bars: profile.barCount,
                  poc: profile.poc ? profile.poc.mid.toFixed(2) : "—",
                  vaLow: profile.vaLow.toFixed(2),
                  vaHigh: profile.vaHigh.toFixed(2),
                })}
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Legend ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mt-1.5 px-0.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#3b82f6]"/>MA20</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#f97316]"/>MA50</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#a855f7]"/>MA200</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#f59e0b] border-dashed"/>{t('hLinesSaved')}</span>
        {showVP && !vpSplit && (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block bg-[#94a3b8]/50"/>{t('vpValueArea')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block bg-[#facc15]/70"/>{t('vpPoc')}</span>
          </>
        )}
        {showVP && vpSplit && (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block bg-[#22c55e]/50"/>{t('vpBuying')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block bg-[#ef4444]/50"/>{t('vpSelling')}</span>
          </>
        )}
      </div>
    </div>
  );

  // The wrapper is always rendered and only its class changes: swapping the root
  // element in and out would make React remount the card, and the chart's
  // container node — canvases and all — would go with it.
  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-3 sm:p-6 flex flex-col"
          : ""
      }
    >
      {card}
    </div>
  );
}
