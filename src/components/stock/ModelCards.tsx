"use client";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/lib/api";
import {
  TrendingUp, TrendingDown, Minus, Loader2, ShieldCheck, ShieldAlert,
  Activity, BarChart3, Brain, Zap, Target, Waves,
} from "lucide-react";

const MODEL_META: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
  ensemble:         { label: "Ensemble",        desc: "Regime-weighted blend of all models", icon: <Brain className="w-4 h-4" /> },
  factor_model:     { label: "Factor Model",    desc: "Fama-French 5 + Momentum + Quality", icon: <BarChart3 className="w-4 h-4" /> },
  price_predictor:  { label: "Price Predictor",  desc: "Ridge/Lasso on 60 technical indicators", icon: <Target className="w-4 h-4" /> },
  xgboost:          { label: "XGBoost",          desc: "Gradient boosting, non-linear signals", icon: <Zap className="w-4 h-4" /> },
  lightgbm:         { label: "LightGBM",         desc: "Histogram boosting, fast inference", icon: <Zap className="w-4 h-4" /> },
  monte_carlo:      { label: "Monte Carlo",      desc: "10K simulated paths, price distribution", icon: <Waves className="w-4 h-4" /> },
  garch:            { label: "GARCH(1,1)",       desc: "Volatility clustering & persistence", icon: <Activity className="w-4 h-4" /> },
  altman_zscore:    { label: "Altman Z-Score",   desc: "Bankruptcy probability score", icon: <ShieldCheck className="w-4 h-4" /> },
  piotroski_fscore: { label: "Piotroski F",      desc: "9-point fundamental quality screen", icon: <ShieldAlert className="w-4 h-4" /> },
  mean_reversion:   { label: "Mean Reversion",   desc: "OU equilibrium & reversion speed", icon: <Activity className="w-4 h-4" /> },
  lstm_forecast:    { label: "LSTM Forecast",     desc: "Neural network with MC-Dropout", icon: <Brain className="w-4 h-4" /> },
};

function extractSignal(model: any): { value: string; label: string; color: string } {
  const pred = model.prediction_json || {};
  const type = model.model_type;

  // Ensemble
  if (type === "ensemble") {
    const ret = pred.predicted_return;
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
    const score = pred.score ?? pred.f_score;
    const quality = pred.quality || (score >= 7 ? "STRONG" : score >= 4 ? "NEUTRAL" : "WEAK");
    const color = quality === "STRONG" ? "text-green-400" : quality === "NEUTRAL" ? "text-yellow-400" : "text-red-400";
    return { value: score != null ? `${score}/9` : "—", label: quality, color };
  }

  // Mean Reversion
  if (type === "mean_reversion") {
    const z = pred.z_score;
    const signal = pred.signal || (Math.abs(z || 0) > 2 ? "MEAN REVERT" : "EQUILIBRIUM");
    const color = (z || 0) > 2 ? "text-red-400" : (z || 0) < -2 ? "text-green-400" : "text-slate-400";
    return { value: z != null ? z.toFixed(2) : "—", label: signal.replace(/_/g, " "), color };
  }

  // GARCH
  if (type === "garch") {
    const vol = pred.current_annual_vol ?? pred.annualized_vol;
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
    const median = pred.median_return ?? pred.median_price_return;
    const probProfit = pred.prob_profit;
    const color = (probProfit || 0) > 0.55 ? "text-green-400" : (probProfit || 0) < 0.45 ? "text-red-400" : "text-yellow-400";
    return {
      value: probProfit != null ? `${(probProfit * 100).toFixed(0)}%` : "—",
      label: "Prob. profit",
      color,
    };
  }

  // Return-based models (xgboost, lightgbm, price_predictor, factor_model, lstm_forecast)
  const ret = pred.predicted_return ?? pred.predicted_3m_return ?? pred.forecast_return;
  if (ret != null) {
    const color = ret > 0.03 ? "text-green-400" : ret < -0.03 ? "text-red-400" : "text-yellow-400";
    return { value: `${(ret * 100).toFixed(1)}%`, label: "3M return", color };
  }

  return { value: "—", label: "", color: "text-slate-500" };
}

export function ModelCards({ ticker }: { ticker: string }) {
  const { data: results, isLoading } = useQuery({
    queryKey: ["model-results", ticker],
    queryFn: () => modelsApi.results(ticker),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        No quant model results available yet. Models run automatically before FinVibe&apos;s Thoughts generation.
      </div>
    );
  }

  // Sort: ensemble first, then alphabetical
  const sorted = [...results].sort((a: any, b: any) => {
    if (a.model_type === "ensemble") return -1;
    if (b.model_type === "ensemble") return 1;
    return a.model_type.localeCompare(b.model_type);
  });

  return (
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
                : "border-border/30 bg-white/[0.02] hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={isEnsemble ? "text-primary" : "text-slate-500"}>{meta.icon}</span>
              <span className={`text-xs font-semibold ${isEnsemble ? "text-primary" : "text-slate-300"}`}>
                {meta.label}
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
            <div className="text-[10px] text-slate-600 mt-1.5 leading-tight">
              {meta.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}
