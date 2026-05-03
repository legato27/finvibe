"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { modelsApi, stocksApi } from "@/lib/api";
import {
  Loader2, ShieldCheck, ShieldAlert,
  Activity, BarChart3, Brain, Zap, Target, Waves, Play, Clock,
  ChevronDown,
} from "lucide-react";

type ModelGroup = "forecast" | "risk" | "fundamentals";

const MODEL_META: Record<
  string,
  { label: string; desc: string; long: string; icon: React.ReactNode; group: ModelGroup }
> = {
  ensemble: {
    label: "Ensemble",
    desc: "Regime-weighted blend of all models",
    long:
      "The final blended prediction. We weight the other models by current market conditions — in calm markets we trust momentum models more, in turbulent markets we trust fundamentals more. The percentage is the expected 3-month return. A forecast, not a guarantee.",
    icon: <Brain className="w-4 h-4" />,
    group: "forecast",
  },
  kronos: {
    label: "Kronos",
    desc: "Transformer foundation model trained on 45+ exchanges",
    long:
      "An open-source Transformer foundation model (Kronos-base, 102M parameters) pre-trained on candlesticks from 45+ global exchanges. Reads the last ~400 days of OHLCV and autoregressively generates the next 63 days. Confidence bands come from 20 stochastic samples — wider bands mean the model sees multiple plausible futures.",
    icon: <Brain className="w-4 h-4" />,
    group: "forecast",
  },
  lstm_forecast: {
    label: "LSTM Forecast",
    desc: "Neural net with uncertainty estimate",
    long:
      "A recurrent neural network that reads the last 60 days of price and volume to predict the next 63. Uses attention to focus on the most important bars. Our confidence interval comes from running the network 50× with random neurons turned off — tighter interval = higher conviction.",
    icon: <Brain className="w-4 h-4" />,
    group: "forecast",
  },
  xgboost: {
    label: "XGBoost",
    desc: "Pattern recognition on 40+ indicators",
    long:
      "Tree-based machine learning that reads 40+ technical indicators (RSI, MACD, Bollinger Bands, moving averages, volatility, volume) and learns non-linear patterns from ~10 years of history. Outputs a 3-month return forecast. Only sees price and volume — blind to earnings and news.",
    icon: <Zap className="w-4 h-4" />,
    group: "forecast",
  },
  lightgbm: {
    label: "LightGBM",
    desc: "Fast boosting, handles missing data",
    long:
      "Same idea as XGBoost with a faster algorithm and better handling of missing data. Confirms or contradicts XGBoost — if both agree, the technical signal is robust. If they disagree, the pattern is ambiguous.",
    icon: <Zap className="w-4 h-4" />,
    group: "forecast",
  },
  factor_model: {
    label: "Factor Model",
    desc: "Fama-French 5 + Momentum + Quality",
    long:
      "Decomposes the stock's return into 7 well-studied drivers: market, size, value, profitability, investment, momentum, and quality. Tells you why the forecast is what it is — e.g. 'mostly a momentum bet' vs. 'pure market exposure'.",
    icon: <BarChart3 className="w-4 h-4" />,
    group: "forecast",
  },
  price_predictor: {
    label: "Price Predictor",
    desc: "Linear regression on technical indicators",
    long:
      "A simple linear regression baseline (Ridge/Lasso) on technical indicators. Acts as a sanity check — if the sophisticated models drift far from this simple one, the fancy forecast may be noise.",
    icon: <Target className="w-4 h-4" />,
    group: "forecast",
  },
  monte_carlo: {
    label: "Monte Carlo",
    desc: "10K simulated paths, probability of profit",
    long:
      "Simulates 10,000 possible price paths using the stock's historical drift and volatility. The number is the probability of closing higher than today in 3 months. Above 55% = favorable odds, 45–55% = coin flip, below 45% = unfavorable.",
    icon: <Waves className="w-4 h-4" />,
    group: "risk",
  },
  garch: {
    label: "GARCH(1,1)",
    desc: "Volatility forecast, not direction",
    long:
      "Does not predict direction. Answers: 'How turbulent will this stock be?' Reads annualized volatility: <25% calm, 25–40% normal, >40% turbulent. Persistence tells you how long a vol spike sticks — near 1.0 means turbulence feeds on itself.",
    icon: <Activity className="w-4 h-4" />,
    group: "risk",
  },
  mean_reversion: {
    label: "Mean Reversion",
    desc: "How stretched is the price vs. its mean",
    long:
      "Fits an Ornstein-Uhlenbeck process and measures how far price has drifted from its long-run average, in standard-deviation units. z < -2 → statistically cheap (likely to revert up). z > +2 → statistically rich (likely to revert down). |z| < 1 → near equilibrium. Breaks down on strongly trending stocks.",
    icon: <Activity className="w-4 h-4" />,
    group: "risk",
  },
  altman_zscore: {
    label: "Altman Z-Score",
    desc: "Bankruptcy warning from balance sheet",
    long:
      "A classic 5-ratio test on the balance sheet and income statement. SAFE (Z > 2.99) = healthy. GREY (1.81–2.99) = caution. DISTRESS (Z < 1.81) = elevated bankruptcy risk. Designed for manufacturers — banks and pure-tech can misclassify.",
    icon: <ShieldCheck className="w-4 h-4" />,
    group: "fundamentals",
  },
  piotroski_fscore: {
    label: "Piotroski F",
    desc: "9-point fundamental quality check",
    long:
      "Nine yes/no checks on profitability, leverage, liquidity, and operational efficiency (each pass = 1 point). 8–9 STRONG (improving fundamentals), 4–7 NEUTRAL, 0–3 WEAK (deteriorating). A trailing indicator — tells you about past health, not future price.",
    icon: <ShieldAlert className="w-4 h-4" />,
    group: "fundamentals",
  },
};

const GROUP_ORDER: ModelGroup[] = ["forecast", "risk", "fundamentals"];
const GROUP_LABEL: Record<ModelGroup, string> = {
  forecast: "Forecasts",
  risk: "Risk & Volatility",
  fundamentals: "Fundamentals",
};
const GROUP_BLURB: Record<ModelGroup, string> = {
  forecast: "What we expect price to do over the next 3 months.",
  risk: "How turbulent or stretched the stock looks right now.",
  fundamentals: "Quality of the underlying business.",
};

// Light/dark-theme color pairs. Tailwind's -400 shades are designed for dark backgrounds;
// on the cream light theme they wash out to near-illegible.
const COLOR = {
  good: "text-green-700 dark:text-green-400",
  bad:  "text-red-700 dark:text-red-400",
  warn: "text-yellow-700 dark:text-yellow-400",
  neutral: "text-muted-foreground",
} as const;

function extractSignal(model: any): { value: string; label: string; color: string } {
  const pred = model.prediction_json || {};
  const type = model.model_type;

  if (type === "ensemble") {
    const ret = pred.predicted_3m_return ?? pred.ensemble_return ?? pred.predicted_return;
    const signal = pred.signal || "";
    const color = ret > 0.03 ? COLOR.good : ret < -0.03 ? COLOR.bad : COLOR.warn;
    return { value: ret != null ? `${(ret * 100).toFixed(1)}%` : "—", label: signal.replace(/_/g, " "), color };
  }

  if (type === "altman_zscore") {
    const z = pred.z_score ?? pred.score;
    const zone = pred.zone || (z > 2.99 ? "SAFE" : z > 1.81 ? "GREY" : "DISTRESS");
    const color = zone === "SAFE" ? COLOR.good : zone === "GREY" ? COLOR.warn : COLOR.bad;
    return { value: z != null ? z.toFixed(2) : "—", label: zone, color };
  }

  if (type === "piotroski_fscore") {
    const score = pred.f_score ?? pred.score;
    const quality = pred.signal || pred.quality || (score >= 7 ? "STRONG" : score >= 4 ? "NEUTRAL" : "WEAK");
    const color = quality === "STRONG" ? COLOR.good : quality === "NEUTRAL" ? COLOR.warn : COLOR.bad;
    return { value: score != null ? `${score}/9` : "—", label: quality, color };
  }

  if (type === "mean_reversion") {
    const z = pred.z_score;
    const signal = pred.signal || (Math.abs(z || 0) > 2 ? "MEAN REVERT" : "EQUILIBRIUM");
    const color = (z || 0) > 2 ? COLOR.bad : (z || 0) < -2 ? COLOR.good : COLOR.neutral;
    return { value: z != null ? z.toFixed(2) : "—", label: signal.replace(/_/g, " "), color };
  }

  if (type === "garch") {
    const vol = pred.current_vol_annualized ?? pred.current_annual_vol ?? pred.annualized_vol;
    const persistence = pred.persistence;
    const color = (vol || 0) > 0.4 ? COLOR.bad : (vol || 0) > 0.25 ? COLOR.warn : COLOR.good;
    return {
      value: vol != null ? `${(vol * 100).toFixed(0)}%` : "—",
      label: persistence != null ? `Persistence: ${persistence.toFixed(2)}` : "Vol",
      color,
    };
  }

  if (type === "monte_carlo") {
    const dist = pred.distribution || {};
    const probProfit = dist.prob_profit ?? pred.prob_profit;
    const color = (probProfit || 0) > 0.55 ? COLOR.good : (probProfit || 0) < 0.45 ? COLOR.bad : COLOR.warn;
    return {
      value: probProfit != null ? `${(probProfit * 100).toFixed(0)}%` : "—",
      label: "Prob. profit",
      color,
    };
  }

  // Return-based forecasters (xgboost, lightgbm, price_predictor, factor_model, lstm_forecast, kronos)
  const ret = pred.predicted_3m_return ?? pred.predicted_return ?? pred.forecast_return;
  if (ret != null) {
    const color = ret > 0.03 ? COLOR.good : ret < -0.03 ? COLOR.bad : COLOR.warn;
    return { value: `${(ret * 100).toFixed(1)}%`, label: "3M return", color };
  }

  return { value: "—", label: "", color: COLOR.neutral };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Inline SVG sparkline of a forecast curve with optional p10/p90 band. */
function ForecastSparkline({ pred, currentPrice }: { pred: any; currentPrice?: number }) {
  const mean: number[] = pred?.forecast?.mean || [];
  const p10: number[] = pred?.forecast?.p10 || [];
  const p90: number[] = pred?.forecast?.p90 || [];
  if (!mean.length) return null;

  const W = 280;
  const H = 64;
  const PAD = 2;

  const all = [...mean, ...p10, ...p90, ...(currentPrice != null ? [currentPrice] : [])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / (mean.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - 2 * PAD);

  const meanPath = mean.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const bandPath =
    p10.length === mean.length && p90.length === mean.length
      ? `M${p10.map((v, i) => `${x(i)},${y(v)}`).join(" L")} L${p90
          .slice()
          .reverse()
          .map((v, i) => `${x(p90.length - 1 - i)},${y(v)}`)
          .join(" L")} Z`
      : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none" aria-hidden="true">
      {bandPath && <path d={bandPath} className="fill-primary/15" />}
      {currentPrice != null && (
        <line
          x1={PAD}
          x2={W - PAD}
          y1={y(currentPrice)}
          y2={y(currentPrice)}
          className="stroke-muted-foreground/40"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      <path d={meanPath} className="stroke-primary" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

/** Pick out the most useful scalar fields from `prediction_json` for the expanded detail row. */
function detailRows(model: any): Array<[string, string]> {
  const pred = model.prediction_json || {};
  const fmt = (v: unknown): string => {
    if (v == null) return "—";
    if (typeof v === "number") {
      if (Math.abs(v) >= 1000) return v.toFixed(0);
      if (Math.abs(v) < 1 && v !== 0) return v.toFixed(4);
      return v.toFixed(2);
    }
    return String(v);
  };
  const pct = (v: unknown): string => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—");

  const rows: Array<[string, string]> = [];
  const t = model.model_type;

  if (pred.current_price != null) rows.push(["Current price", fmt(pred.current_price)]);
  if (pred.predicted_price_3m != null) rows.push(["Predicted price (3M)", fmt(pred.predicted_price_3m)]);

  if (t === "ensemble" && pred.regime) rows.push(["Market regime", String(pred.regime)]);
  if (t === "kronos" || t === "lstm_forecast") {
    if (pred.architecture) rows.push(["Architecture", String(pred.architecture)]);
    if (pred.mc_samples != null) rows.push(["Sample paths", fmt(pred.mc_samples)]);
  }
  if (t === "xgboost" || t === "lightgbm" || t === "price_predictor") {
    if (pred.r_squared != null) rows.push(["R²", fmt(pred.r_squared)]);
    if (pred.n_features != null) rows.push(["Features", fmt(pred.n_features)]);
  }
  if (t === "factor_model" && pred.factor_exposures) {
    Object.entries(pred.factor_exposures).slice(0, 5).forEach(([k, v]) => rows.push([k, fmt(v)]));
  }
  if (t === "monte_carlo") {
    const d = pred.distribution || pred;
    if (d.expected_return != null) rows.push(["Expected return", pct(d.expected_return)]);
    if (d.p05 != null) rows.push(["5th percentile", fmt(d.p05)]);
    if (d.p50 != null) rows.push(["Median", fmt(d.p50)]);
    if (d.p95 != null) rows.push(["95th percentile", fmt(d.p95)]);
  }
  if (t === "garch") {
    if (pred.persistence != null) rows.push(["Persistence", fmt(pred.persistence)]);
    if (pred.long_run_vol != null) rows.push(["Long-run vol", pct(pred.long_run_vol)]);
  }
  if (t === "mean_reversion") {
    if (pred.half_life != null) rows.push(["Half-life (days)", fmt(pred.half_life)]);
    if (pred.long_run_mean != null) rows.push(["Long-run mean", fmt(pred.long_run_mean)]);
  }
  if (t === "altman_zscore" && pred.ratios) {
    Object.entries(pred.ratios).slice(0, 5).forEach(([k, v]) => rows.push([k, fmt(v)]));
  }
  if (t === "piotroski_fscore" && pred.checks) {
    const passed = Object.entries(pred.checks).filter(([, v]) => v).map(([k]) => k);
    rows.push(["Passed", `${passed.length}/9`]);
  }

  if (pred.data_years != null) rows.push(["Data history (yr)", fmt(pred.data_years)]);
  if (pred.device) rows.push(["Compute", String(pred.device)]);

  return rows;
}

function ModelCard({
  model,
  meta,
  isEnsemble,
  expanded,
  onToggle,
}: {
  model: any;
  meta: { label: string; desc: string; long: string; icon: React.ReactNode };
  isEnsemble: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const signal = extractSignal(model);
  const pred = model.prediction_json || {};
  const hasForecastCurve = Array.isArray(pred?.forecast?.mean) && pred.forecast.mean.length > 1;
  const rows = useMemo(() => detailRows(model), [model]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`rounded-lg border p-3 cursor-pointer transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        isEnsemble
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10 col-span-2 md:col-span-1"
          : "border-border bg-card hover:bg-accent/40"
      } ${expanded ? "md:col-span-2 lg:col-span-2" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={isEnsemble ? "text-primary" : "text-muted-foreground"}>{meta.icon}</span>
        <span className={`text-xs font-semibold ${isEnsemble ? "text-primary" : "text-foreground"}`}>
          {meta.label}
        </span>
        <ChevronDown
          className={`ml-auto w-3.5 h-3.5 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </div>

      <div className={`text-xl font-mono font-bold ${signal.color}`}>{signal.value}</div>
      {signal.label && (
        <div className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 ${signal.color}`}>
          {signal.label}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{meta.desc}</div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
          {hasForecastCurve && (
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <span>63-day forecast</span>
                {pred.forecast?.p10 && pred.forecast?.p90 && <span>p10–p90 band</span>}
              </div>
              <ForecastSparkline pred={pred} currentPrice={pred.current_price} />
            </div>
          )}

          {rows.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground truncate">{k}</dt>
                  <dd className="font-mono text-foreground tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">{meta.long}</p>

          {model.run_at && (
            <div className="text-[10px] text-muted-foreground/80">Last run {timeAgo(model.run_at)}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ModelCards({ ticker }: { ticker: string }) {
  const qc = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [generatingThoughts, setGeneratingThoughts] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((modelType: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(modelType)) next.delete(modelType);
      else next.add(modelType);
      return next;
    });
  }, []);

  const { data: results, isLoading } = useQuery({
    queryKey: ["model-results", ticker],
    queryFn: () => modelsApi.results(ticker),
    staleTime: 60_000,
    retry: false,
  });

  const { data: lastRunInfo } = useQuery({
    queryKey: ["model-last-run", ticker],
    queryFn: () => modelsApi.lastRun(ticker),
    staleTime: 30_000,
  });

  const { data: taskStatus } = useQuery({
    queryKey: ["model-task", taskId],
    queryFn: () => modelsApi.taskStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: 3_000,
  });

  useEffect(() => {
    if (taskStatus?.status === "SUCCESS" || taskStatus?.status === "FAILURE") {
      setTaskId(null);
      qc.invalidateQueries({ queryKey: ["model-results", ticker] });
      qc.invalidateQueries({ queryKey: ["model-last-run", ticker] });
      if (taskStatus.status === "FAILURE") {
        setRunError("Model run failed");
      } else {
        setGeneratingThoughts(true);
      }
    }
  }, [taskStatus?.status, ticker, qc]);

  useQuery({
    queryKey: ["thoughts-poll", ticker],
    queryFn: async () => {
      const res = await stocksApi.thoughts(ticker);
      return res;
    },
    enabled: generatingThoughts,
    refetchInterval: 10_000,
    staleTime: 0,
  });

  const { data: currentThoughts } = useQuery({
    queryKey: ["stock-thoughts", ticker],
    queryFn: () => stocksApi.thoughts(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!generatingThoughts) return;
    const generatedAt = currentThoughts?.generated_at;
    if (generatedAt) {
      const age = Date.now() - new Date(generatedAt).getTime();
      if (age < 120_000) {
        setGeneratingThoughts(false);
        qc.invalidateQueries({ queryKey: ["llm-analysis", ticker] });
        qc.invalidateQueries({ queryKey: ["llm-analysis-batch"] });
        qc.invalidateQueries({ queryKey: ["stock-detail", ticker] });
      }
    }
  }, [currentThoughts?.generated_at, generatingThoughts, ticker, qc]);

  const isRunning = !!taskId;
  const canRun = lastRunInfo?.can_run && !isRunning && !generatingThoughts;

  const handleRunAll = useCallback(async () => {
    setRunError(null);
    try {
      const res = await modelsApi.runAll(ticker);
      setTaskId(res.task_id);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (typeof detail === "object" && detail?.message) {
        setRunError(detail.message);
      } else {
        setRunError(typeof detail === "string" ? detail : "Failed to start models");
      }
      qc.invalidateQueries({ queryKey: ["model-last-run", ticker] });
    }
  }, [ticker, qc]);

  // Group results by MODEL_META.group so we can render section-by-section.
  // Within each group: ensemble first, then alphabetical.
  const grouped = useMemo(() => {
    const out: Record<ModelGroup, any[]> = { forecast: [], risk: [], fundamentals: [] };
    if (!results?.length) return out;
    for (const m of results) {
      const meta = MODEL_META[m.model_type];
      if (!meta) continue;
      out[meta.group].push(m);
    }
    for (const g of GROUP_ORDER) {
      out[g].sort((a, b) => {
        if (a.model_type === "ensemble") return -1;
        if (b.model_type === "ensemble") return 1;
        return a.model_type.localeCompare(b.model_type);
      });
    }
    return out;
  }, [results]);

  if (isLoading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalRendered =
    grouped.forecast.length + grouped.risk.length + grouped.fundamentals.length;

  return (
    <div className="space-y-4">
      {/* Run bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastRunInfo?.last_run && (
            <>
              <Clock className="w-3 h-3" />
              <span>Last run {timeAgo(lastRunInfo.last_run)}</span>
            </>
          )}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running models...
            </span>
          )}
          {generatingThoughts && !isRunning && (
            <span className="flex items-center gap-1.5 text-primary">
              <Brain className="w-3 h-3 animate-pulse" />
              Generating FinVibe&apos;s Thoughts...
            </span>
          )}
          {runError && (
            <span className="text-amber-700 dark:text-amber-400">{runError}</span>
          )}
        </div>
        <button
          onClick={handleRunAll}
          disabled={!canRun}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
            canRun
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-muted text-muted-foreground/70 cursor-not-allowed"
          }`}
          title={
            isRunning ? "Models are running..." :
            !lastRunInfo?.can_run ? `Next run available ${lastRunInfo?.next_available ? timeAgo(lastRunInfo.next_available) : "tomorrow"}` :
            "Run all quant models"
          }
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {isRunning ? "Running..." : "Run Models"}
        </button>
      </div>

      {/* Grouped model cards */}
      {totalRendered === 0 ? (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          No quant model results yet. Click &quot;Run Models&quot; to generate predictions.
        </div>
      ) : (
        <div className="space-y-5">
          {GROUP_ORDER.map((g) => {
            const items = grouped[g];
            if (items.length === 0) return null;
            return (
              <section key={g}>
                <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">{GROUP_LABEL[g]}</h3>
                  <p className="text-[11px] text-muted-foreground">{GROUP_BLURB[g]}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
                  {items.map((model: any) => {
                    const meta = MODEL_META[model.model_type] || {
                      label: model.model_type,
                      desc: "",
                      long: "",
                      icon: <BarChart3 className="w-4 h-4" />,
                    };
                    return (
                      <ModelCard
                        key={model.model_type}
                        model={model}
                        meta={meta}
                        isEnsemble={model.model_type === "ensemble"}
                        expanded={expanded.has(model.model_type)}
                        onToggle={() => toggleExpanded(model.model_type)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
