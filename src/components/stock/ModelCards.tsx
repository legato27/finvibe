"use client";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { modelsApi, stocksApi } from "@/lib/api";
import {
  TrendingUp, TrendingDown, Minus, Loader2, ShieldCheck, ShieldAlert,
  Activity, BarChart3, Brain, Zap, Target, Waves, Play, Clock,
} from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

const MODEL_META: Record<string, { label: string; desc: string; long: string; icon: React.ReactNode }> = {
  ensemble: {
    label: "Ensemble",
    desc: "Regime-weighted blend of all models",
    long:
      "The final blended prediction. We weight the other models by current market conditions — in calm markets we trust momentum models more, in turbulent markets we trust fundamentals more. The percentage is the expected 3-month return. A forecast, not a guarantee.",
    icon: <Brain className="w-4 h-4" />,
  },
  factor_model: {
    label: "Factor Model",
    desc: "Fama-French 5 + Momentum + Quality",
    long:
      "Decomposes the stock's return into 7 well-studied drivers: market, size, value, profitability, investment, momentum, and quality. Tells you why the forecast is what it is — e.g. 'mostly a momentum bet' vs. 'pure market exposure'.",
    icon: <BarChart3 className="w-4 h-4" />,
  },
  price_predictor: {
    label: "Price Predictor",
    desc: "Linear regression on technical indicators",
    long:
      "A simple linear regression baseline (Ridge/Lasso) on technical indicators. Acts as a sanity check — if the sophisticated models drift far from this simple one, the fancy forecast may be noise.",
    icon: <Target className="w-4 h-4" />,
  },
  xgboost: {
    label: "XGBoost",
    desc: "Pattern recognition on 40+ indicators",
    long:
      "Tree-based machine learning that reads 40+ technical indicators (RSI, MACD, Bollinger Bands, moving averages, volatility, volume) and learns non-linear patterns from ~10 years of history. Outputs a 3-month return forecast. Only sees price and volume — blind to earnings and news.",
    icon: <Zap className="w-4 h-4" />,
  },
  lightgbm: {
    label: "LightGBM",
    desc: "Fast boosting, handles missing data",
    long:
      "Same idea as XGBoost with a faster algorithm and better handling of missing data. Confirms or contradicts XGBoost — if both agree, the technical signal is robust. If they disagree, the pattern is ambiguous.",
    icon: <Zap className="w-4 h-4" />,
  },
  monte_carlo: {
    label: "Monte Carlo",
    desc: "10K simulated paths, probability of profit",
    long:
      "Simulates 10,000 possible price paths using the stock's historical drift and volatility. The number is the probability of closing higher than today in 3 months. Above 55% = favorable odds, 45–55% = coin flip, below 45% = unfavorable.",
    icon: <Waves className="w-4 h-4" />,
  },
  garch: {
    label: "GARCH(1,1)",
    desc: "Volatility forecast, not direction",
    long:
      "Does not predict direction. Answers: 'How turbulent will this stock be?' Reads annualized volatility: <25% calm, 25–40% normal, >40% turbulent. Persistence tells you how long a vol spike sticks — near 1.0 means turbulence feeds on itself.",
    icon: <Activity className="w-4 h-4" />,
  },
  altman_zscore: {
    label: "Altman Z-Score",
    desc: "Bankruptcy warning from balance sheet",
    long:
      "A classic 5-ratio test on the balance sheet and income statement. SAFE (Z > 2.99) = healthy. GREY (1.81–2.99) = caution. DISTRESS (Z < 1.81) = elevated bankruptcy risk. Designed for manufacturers — banks and pure-tech can misclassify.",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  piotroski_fscore: {
    label: "Piotroski F",
    desc: "9-point fundamental quality check",
    long:
      "Nine yes/no checks on profitability, leverage, liquidity, and operational efficiency (each pass = 1 point). 8–9 STRONG (improving fundamentals), 4–7 NEUTRAL, 0–3 WEAK (deteriorating). A trailing indicator — tells you about past health, not future price.",
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  mean_reversion: {
    label: "Mean Reversion",
    desc: "How stretched is the price vs. its mean",
    long:
      "Fits an Ornstein-Uhlenbeck process and measures how far price has drifted from its long-run average, in standard-deviation units. z < -2 → statistically cheap (likely to revert up). z > +2 → statistically rich (likely to revert down). |z| < 1 → near equilibrium. Breaks down on strongly trending stocks.",
    icon: <Activity className="w-4 h-4" />,
  },
  lstm_forecast: {
    label: "LSTM Forecast",
    desc: "Neural net with uncertainty estimate",
    long:
      "A recurrent neural network that reads the last 60 days of price and volume to predict the next 63. Uses attention to focus on the most important bars. Our confidence interval comes from running the network 50× with random neurons turned off — tighter interval = higher conviction.",
    icon: <Brain className="w-4 h-4" />,
  },
};

function extractSignal(model: any): { value: string; label: string; color: string } {
  const pred = model.prediction_json || {};
  const type = model.model_type;

  // Ensemble
  if (type === "ensemble") {
    const ret = pred.predicted_3m_return ?? pred.ensemble_return ?? pred.predicted_return;
    const signal = pred.signal || "";
    const color = ret > 0.03 ? "text-green-400" : ret < -0.03 ? "text-red-400" : "text-yellow-400";
    return { value: ret != null ? `${(ret * 100).toFixed(1)}%` : "—", label: signal.replace(/_/g, " "), color };
  }

  // Altman Z-Score
  if (type === "altman_zscore") {
    const z = pred.z_score ?? pred.score;
    const zone = pred.zone || (z > 2.99 ? "SAFE" : z > 1.81 ? "GREY" : "DISTRESS");
    const color = zone === "SAFE" ? "text-green-400" : zone === "GREY" ? "text-yellow-400" : "text-red-400";
    return { value: z != null ? z.toFixed(2) : "—", label: zone, color };
  }

  // Piotroski
  if (type === "piotroski_fscore") {
    const score = pred.f_score ?? pred.score;
    const quality = pred.signal || pred.quality || (score >= 7 ? "STRONG" : score >= 4 ? "NEUTRAL" : "WEAK");
    const color = quality === "STRONG" ? "text-green-400" : quality === "NEUTRAL" ? "text-yellow-400" : "text-red-400";
    return { value: score != null ? `${score}/9` : "—", label: quality, color };
  }

  // Mean Reversion
  if (type === "mean_reversion") {
    const z = pred.z_score;
    const signal = pred.signal || (Math.abs(z || 0) > 2 ? "MEAN REVERT" : "EQUILIBRIUM");
    const color = (z || 0) > 2 ? "text-red-400" : (z || 0) < -2 ? "text-green-400" : "text-muted-foreground";
    return { value: z != null ? z.toFixed(2) : "—", label: signal.replace(/_/g, " "), color };
  }

  // GARCH
  if (type === "garch") {
    const vol = pred.current_vol_annualized ?? pred.current_annual_vol ?? pred.annualized_vol;
    const persistence = pred.persistence;
    const color = (vol || 0) > 0.4 ? "text-red-400" : (vol || 0) > 0.25 ? "text-yellow-400" : "text-green-400";
    return {
      value: vol != null ? `${(vol * 100).toFixed(0)}%` : "—",
      label: persistence != null ? `Persistence: ${persistence.toFixed(2)}` : "Vol",
      color,
    };
  }

  // Monte Carlo
  if (type === "monte_carlo") {
    const dist = pred.distribution || {};
    const probProfit = dist.prob_profit ?? pred.prob_profit;
    const color = (probProfit || 0) > 0.55 ? "text-green-400" : (probProfit || 0) < 0.45 ? "text-red-400" : "text-yellow-400";
    return {
      value: probProfit != null ? `${(probProfit * 100).toFixed(0)}%` : "—",
      label: "Prob. profit",
      color,
    };
  }

  // Return-based models (xgboost, lightgbm, price_predictor, factor_model, lstm_forecast)
  const ret = pred.predicted_3m_return ?? pred.predicted_return ?? pred.forecast_return;
  if (ret != null) {
    const color = ret > 0.03 ? "text-green-400" : ret < -0.03 ? "text-red-400" : "text-yellow-400";
    return { value: `${(ret * 100).toFixed(1)}%`, label: "3M return", color };
  }

  return { value: "—", label: "", color: "text-muted-foreground" };
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

export function ModelCards({ ticker }: { ticker: string }) {
  const qc = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [generatingThoughts, setGeneratingThoughts] = useState(false);

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

  // Poll task status while running
  const { data: taskStatus } = useQuery({
    queryKey: ["model-task", taskId],
    queryFn: () => modelsApi.taskStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: 3_000,
  });

  // When models complete, refresh results and start tracking thoughts generation
  useEffect(() => {
    if (taskStatus?.status === "SUCCESS" || taskStatus?.status === "FAILURE") {
      setTaskId(null);
      qc.invalidateQueries({ queryKey: ["model-results", ticker] });
      qc.invalidateQueries({ queryKey: ["model-last-run", ticker] });
      if (taskStatus.status === "FAILURE") {
        setRunError("Model run failed");
      } else {
        // Models done → thoughts auto-triggered on backend
        // Record current thoughts timestamp so we can detect when new ones arrive
        setGeneratingThoughts(true);
      }
    }
  }, [taskStatus?.status, ticker, qc]);

  // While generating thoughts, poll LLM analysis for new data
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

  // Detect when fresh thoughts arrive → stop polling
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
      // If thoughts were generated in the last 2 minutes, they're fresh
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

  if (isLoading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sort: ensemble first, then alphabetical
  const sorted = results?.length
    ? [...results].sort((a: any, b: any) => {
        if (a.model_type === "ensemble") return -1;
        if (b.model_type === "ensemble") return 1;
        return a.model_type.localeCompare(b.model_type);
      })
    : [];

  return (
    <div className="space-y-3">
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
            <span className="text-amber-400">{runError}</span>
          )}
        </div>
        <button
          onClick={handleRunAll}
          disabled={!canRun}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
            canRun
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-muted text-muted-foreground/50 cursor-not-allowed"
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

      {/* Model cards */}
      {sorted.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          No quant model results yet. Click &quot;Run Models&quot; to generate predictions.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map((model: any) => {
            const meta = MODEL_META[model.model_type] || {
              label: model.model_type, desc: "", icon: <BarChart3 className="w-4 h-4" />,
            };
            const signal = extractSignal(model);
            const isEnsemble = model.model_type === "ensemble";

            return (
              <div
                key={model.model_type}
                className={`rounded-lg border p-3 transition-colors ${
                  isEnsemble
                    ? "border-primary/30 bg-primary/5 col-span-2 md:col-span-1"
                    : "border-border/30 bg-accent/30 hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={isEnsemble ? "text-primary" : "text-muted-foreground"}>{meta.icon}</span>
                  <span className={`text-xs font-semibold ${isEnsemble ? "text-primary" : "text-foreground/80"}`}>
                    {meta.label}
                  </span>
                  <span className="ml-auto">
                    <InfoTip tip={meta.long} size={12} />
                  </span>
                </div>
                <div className={`text-xl font-mono font-bold ${signal.color}`}>
                  {signal.value}
                </div>
                {signal.label && (
                  <div className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 ${signal.color} opacity-80`}>
                    {signal.label}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/60 mt-1.5 leading-tight">
                  {meta.desc}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
