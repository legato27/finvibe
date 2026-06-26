"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { stocksApi } from "@/lib/api";
import { Download, Pencil, X, Loader2 } from "lucide-react";

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

interface CandleRow {
  time:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ── Constants ────────────────────────────────────────────────

const PERIODS: [Period, string][] = [
  ["1mo", "period1mo"], ["3mo", "period3mo"], ["6mo", "period6mo"],
  ["1y", "period1y"], ["2y", "period2y"], ["5y", "period5y"], ["10y", "periodMax"],
];

const INTERVALS: [Interval, string][] = [
  ["1d", "intervalDay"], ["1wk", "intervalWeek"], ["1mo", "intervalMonth"],
];

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
  const chartRef      = useRef<any>(null);
  const mainSeriesRef = useRef<any>(null);
  const volSeriesRef  = useRef<any>(null);
  const ma20Ref       = useRef<any>(null);
  const ma50Ref       = useRef<any>(null);
  const ma200Ref      = useRef<any>(null);
  const drawLinesRef  = useRef<{ line: any; price: number }[]>([]);
  const liveLineRef   = useRef<any>(null);

  // ── UI state ──────────────────────────────────────────────
  const [period,    setPeriod]    = useState<Period>("1y");
  const [interval,  setInterval_] = useState<Interval>("1d");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [showMA20,  setShowMA20]  = useState(true);
  const [showMA50,  setShowMA50]  = useState(true);
  const [showMA200, setShowMA200] = useState(false);
  const [drawMode,  setDrawMode]  = useState(false);
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
    refetchInterval: 60_000, // keep the last candle moving with the hero's live price
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

  // ── Build / Rebuild chart whenever data or mode changes ──
  useEffect(() => {
    if (!containerRef.current || chartData.length === 0) return;

    let cancelled = false;

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
          height: 320,
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
      }
    );

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, chartMode, ticker, drawKey, priceAction, interval]);

  // ── MA visibility toggles (don't rebuild chart) ──────────
  useEffect(() => { ma20Ref.current?.applyOptions({ visible: showMA20 }); }, [showMA20]);
  useEffect(() => { ma50Ref.current?.applyOptions({ visible: showMA50 }); }, [showMA50]);
  useEffect(() => { ma200Ref.current?.applyOptions({ visible: showMA200 }); }, [showMA200]);

  // ── Live price line — the chart candles are delayed/EOD, so overlay the
  // hero's polled live price and keep it in sync (don't rebuild the chart).
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;
    if (liveLineRef.current) {
      try { series.removePriceLine(liveLineRef.current); } catch { /* ignore */ }
      liveLineRef.current = null;
    }
    if (currentPrice == null) return;
    try {
      liveLineRef.current = series.createPriceLine({
        price: currentPrice, color: "#38bdf8", lineWidth: 1,
        lineStyle: 0, // LineStyle.Solid (enum not in scope outside the lazy chart import)
        axisLabelVisible: true, title: t("livePriceLine"),
      });
    } catch { /* ignore */ }
  }, [currentPrice, chartData, chartMode, t]);

  // ── Resize observer ──────────────────────────────────────
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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
      const a = document.createElement("a");
      a.download = `${ticker}-${period}-${interval}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (e) {
      console.error("Screenshot failed:", e);
    }
  }, [ticker, period, interval]);

  // ── Derived display ───────────────────────────────────────
  const isPositive = (periodChg ?? 0) >= 0;

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="card">
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
            <span className="text-xs text-amber-400 animate-pulse">
              {t('drawHint')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setDrawMode((m) => !m)}
            title={t('drawHLineTitle')}
            className={`p-1 rounded transition-colors ${drawMode ? "text-amber-400 bg-amber-400/10" : "text-muted-foreground hover:text-primary"}`}
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
        </div>
      </div>

      {/* ── OHLCV crosshair readout ────────────────────────── */}
      <div className="h-4 flex gap-3 px-1 mb-1 text-[10px] font-mono text-muted-foreground">
        {ohlcv ? (
          <>
            <span className="text-slate-400">{ohlcv.time}</span>
            {ohlcv.open !== undefined && (
              <>
                <span>O <span className="text-slate-200">{ohlcv.open.toFixed(2)}</span></span>
                <span>H <span className="text-slate-200">{ohlcv.high!.toFixed(2)}</span></span>
                <span>L <span className="text-slate-200">{ohlcv.low!.toFixed(2)}</span></span>
              </>
            )}
            <span>C <span className="text-slate-200">{ohlcv.close.toFixed(2)}</span></span>
            {ohlcv.volume > 0 && (
              <span>V <span className="text-slate-200">{fmtVol(ohlcv.volume)}</span></span>
            )}
          </>
        ) : (
          <span>{t('hoverToInspect')}</span>
        )}
      </div>

      {/* ── Chart container ───────────────────────────────── */}
      <div className="relative">
        <div
          ref={containerRef}
          style={{ height: 320 }}
          className={`w-full ${drawMode ? "cursor-crosshair" : ""}`}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a12]/60 rounded">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {/* ── Controls bar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-border">

        {/* Period selector */}
        <div className="flex gap-px bg-slate-900 rounded p-0.5">
          {PERIODS.map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 text-xs rounded transition-colors
                ${period === p
                  ? "bg-primary text-background font-bold"
                  : "text-slate-400 hover:text-slate-100"}`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {/* Interval selector */}
        <div className="flex gap-px bg-slate-900 rounded p-0.5">
          {INTERVALS.map(([iv, label]) => (
            <button
              key={iv}
              onClick={() => setInterval_(iv)}
              className={`px-2 py-0.5 text-xs rounded transition-colors
                ${interval === iv
                  ? "bg-primary text-background font-bold"
                  : "text-slate-400 hover:text-slate-100"}`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex gap-px bg-slate-900 rounded p-0.5">
          {(["candle", "line"] as ChartMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              className={`px-2 py-0.5 text-xs rounded transition-colors capitalize
                ${chartMode === m
                  ? "bg-primary text-background font-bold"
                  : "text-slate-400 hover:text-slate-100"}`}
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

      {/* ── Legend ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-1.5 px-0.5 text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#3b82f6]"/>MA20</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#f97316]"/>MA50</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#a855f7]"/>MA200</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px inline-block bg-[#f59e0b] border-dashed"/>{t('hLinesSaved')}</span>
      </div>
    </div>
  );
}
