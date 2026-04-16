"use client";
import { useQuery } from "@tanstack/react-query";
import { scannerApi } from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Activity,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
} from "lucide-react";

/* ── Types ── */

interface Pattern {
  pattern: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  status: "confirmed" | "forming";
  description: string;
  start_date: string;
  end_date: string;
  key_levels: Record<string, any>;
  indicator?: string;
}

interface Trend {
  direction: "uptrend" | "downtrend" | "ranging";
  strength: "strong" | "moderate" | "weak";
  description: string;
  ma_structure: string;
  key_levels: Record<string, any>;
}

interface Indicators {
  rsi: number;
  rsi_signal: string;
  macd_histogram: number;
  macd_signal: string;
  bb_position: string;
  bb_squeeze: boolean;
  volume_trend: string;
}

interface TimeframeAnalysis {
  timeframe: string;
  interval: string;
  period: string;
  trend?: Trend;
  pattern?: Pattern;
  indicators?: Indicators;
}

export interface PatternData {
  ticker: string;
  timeframes: TimeframeAnalysis[];
  top_pattern: Pattern | null;
  top_timeframe: string | null;
  overall_trend: string | null;
  summary: string;
}

/* ── Config ── */

const TREND_CFG = {
  uptrend:   { icon: ArrowUpRight,   color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  downtrend: { icon: ArrowDownRight, color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  ranging:   { icon: ArrowRight,     color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
};

const DIR_CFG = {
  bullish: { color: "text-green-400", bar: "bg-green-500", bg: "bg-green-500/5", border: "border-green-500/25" },
  bearish: { color: "text-red-400",   bar: "bg-red-500",   bg: "bg-red-500/5",   border: "border-red-500/25" },
  neutral: { color: "text-yellow-400", bar: "bg-yellow-500", bg: "bg-yellow-500/5", border: "border-yellow-500/25" },
};

/* ── Sub-components ── */

function RsiBadge({ rsi, signal }: { rsi: number; signal: string }) {
  const color = signal === "overbought" ? "text-red-400 bg-red-500/10"
    : signal === "oversold" ? "text-green-400 bg-green-500/10"
    : "text-slate-400 bg-slate-800";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${color}`}>RSI {rsi.toFixed(0)}</span>;
}

function MacdBadge({ signal }: { signal: string }) {
  const bullish = signal.includes("bullish") || signal === "crossing_up";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${bullish ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
      MACD {signal.replace(/_/g, " ")}
    </span>
  );
}

function VolBadge({ trend }: { trend: string }) {
  const color = trend === "spike" ? "text-amber-400 bg-amber-500/10" : trend === "above_avg" ? "text-slate-300 bg-slate-800" : "text-slate-500 bg-slate-800/50";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${color}`}>Vol {trend.replace(/_/g, " ")}</span>;
}

function BbBadge({ position, squeeze }: { position: string; squeeze: boolean }) {
  const color = squeeze ? "text-amber-400 bg-amber-500/10" : "text-slate-500 bg-slate-800/50";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${color}`}>BB {squeeze ? "SQUEEZE" : position.replace(/_/g, " ")}</span>;
}

function TimeframeCard({ tf, isTop }: { tf: TimeframeAnalysis; isTop: boolean }) {
  const trend = tf.trend;
  const pattern = tf.pattern;
  const ind = tf.indicators;
  const tCfg = trend ? TREND_CFG[trend.direction] : null;
  const TrendIcon = tCfg?.icon ?? ArrowRight;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${
      isTop ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/5" : "border-border bg-card"
    }`}>
      {/* ── Card Header: Timeframe + Trend ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-slate-200">{tf.timeframe}</span>
          {isTop && (
            <span className="text-[8px] px-1.5 py-0.5 bg-primary/25 text-primary rounded-full font-bold tracking-wider uppercase">
              Top
            </span>
          )}
        </div>
        {tCfg && trend && (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${tCfg.bg} ${tCfg.border} border`}>
            <TrendIcon className={`w-3.5 h-3.5 ${tCfg.color}`} />
            <span className={`text-[11px] font-semibold ${tCfg.color} capitalize`}>
              {trend.direction}{trend.strength === "strong" ? "" : ` (${trend.strength})`}
            </span>
          </div>
        )}
      </div>

      {/* ── MA Structure ── */}
      {trend && (
        <div className="text-[10px] text-slate-500 font-mono truncate" title={trend.ma_structure}>
          {trend.ma_structure}
        </div>
      )}

      {/* ── Active Pattern ── */}
      {pattern ? (() => {
        const dc = DIR_CFG[pattern.direction];
        const pct = Math.round(pattern.confidence * 100);
        const DirIcon = pattern.direction === "bullish" ? TrendingUp : pattern.direction === "bearish" ? TrendingDown : Minus;

        return (
          <div className={`rounded-lg border ${dc.border} ${dc.bg} p-3 space-y-2`}>
            {/* Pattern name + confidence */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <DirIcon className={`w-4 h-4 ${dc.color} flex-shrink-0`} />
                <span className="text-sm font-bold text-slate-100">{pattern.pattern}</span>
                {pattern.indicator && (
                  <span className="text-[9px] px-1 py-0 bg-slate-700/80 rounded text-slate-400">{pattern.indicator}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {pattern.status === "confirmed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
                )}
                <span className={`text-lg font-bold font-mono ${dc.color}`}>{pct}%</span>
              </div>
            </div>

            {/* Confidence bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${dc.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>

            {/* Description */}
            <p className="text-[11px] text-slate-400 leading-relaxed">{pattern.description}</p>

            {/* Key levels */}
            <div className="flex flex-wrap gap-1">
              {Object.entries(pattern.key_levels).map(([k, v]) => (
                <span key={k} className="text-[9px] px-1.5 py-0.5 bg-slate-800/80 rounded text-slate-300 font-mono">
                  {k.replace(/_/g, " ")}: {typeof v === "number" ? `$${v.toFixed(2)}` : String(v)}
                </span>
              ))}
            </div>
          </div>
        );
      })() : (
        <div className="rounded-lg border border-border/30 bg-slate-900/20 p-3">
          <p className="text-[11px] text-slate-600 italic text-center">No active pattern</p>
        </div>
      )}

      {/* ── Indicator Pills ── */}
      {ind && (
        <div className="flex flex-wrap gap-1.5">
          <RsiBadge rsi={ind.rsi} signal={ind.rsi_signal} />
          <MacdBadge signal={ind.macd_signal} />
          <BbBadge position={ind.bb_position} squeeze={ind.bb_squeeze} />
          <VolBadge trend={ind.volume_trend} />
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */

export function TechnicalAnalysis({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useQuery<PatternData>({
    queryKey: ["patterns", ticker],
    queryFn: () => scannerApi.patterns(ticker),
    staleTime: 60_000 * 5,
  });

  const overallCfg = data?.overall_trend ? TREND_CFG[data.overall_trend as keyof typeof TREND_CFG] : null;
  const OverallIcon = overallCfg?.icon ?? ArrowRight;

  return (
    <div className="space-y-3">
      {/* ── Section Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Technical Analysis</h2>
        </div>
        {overallCfg && data?.overall_trend && (
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${overallCfg.bg} ${overallCfg.border}`}>
            <OverallIcon className={`w-4 h-4 ${overallCfg.color}`} />
            <span className={`text-xs font-bold ${overallCfg.color} capitalize`}>
              {data.overall_trend}
            </span>
          </div>
        )}
      </div>

      {/* ── Summary ── */}
      {data?.summary && (
        <p className="text-xs text-slate-500 leading-relaxed">{data.summary}</p>
      )}

      {/* ── Loading / Error ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          <span className="ml-2 text-sm text-slate-500">Analyzing current price action...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 py-4 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" />
          Failed to load analysis
        </div>
      )}

      {/* ── 2x2 Card Grid ── */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.timeframes.map((tf) => (
            <TimeframeCard
              key={tf.timeframe}
              tf={tf}
              isTop={!!data.top_timeframe && tf.timeframe === data.top_timeframe}
            />
          ))}
        </div>
      )}
    </div>
  );
}
