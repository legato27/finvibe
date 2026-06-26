"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { modelsApi, stocksApi } from "@/lib/api";
import { NEUTRAL_BAND } from "@/lib/signals";
import {
  Loader2, ShieldCheck, ShieldAlert,
  Activity, BarChart3, Brain, Zap, Target, Waves, Play, Clock,
  ChevronDown,
} from "lucide-react";

type ModelGroup = "forecast" | "risk" | "fundamentals";

// Model type keys used by both MODEL_META icons and translation lookups.
type ModelTypeKey =
  | "ensemble" | "kronos" | "lstm_forecast" | "xgboost" | "lightgbm"
  | "factor_model" | "price_predictor" | "monte_carlo" | "garch"
  | "mean_reversion" | "altman_zscore" | "piotroski_fscore";

const MODEL_META: Record<
  ModelTypeKey,
  { icon: React.ReactNode; group: ModelGroup }
> = {
  ensemble: { icon: <Brain className="w-4 h-4" />, group: "forecast" },
  kronos: { icon: <Brain className="w-4 h-4" />, group: "forecast" },
  lstm_forecast: { icon: <Brain className="w-4 h-4" />, group: "forecast" },
  xgboost: { icon: <Zap className="w-4 h-4" />, group: "forecast" },
  lightgbm: { icon: <Zap className="w-4 h-4" />, group: "forecast" },
  factor_model: { icon: <BarChart3 className="w-4 h-4" />, group: "forecast" },
  price_predictor: { icon: <Target className="w-4 h-4" />, group: "forecast" },
  monte_carlo: { icon: <Waves className="w-4 h-4" />, group: "risk" },
  garch: { icon: <Activity className="w-4 h-4" />, group: "risk" },
  mean_reversion: { icon: <Activity className="w-4 h-4" />, group: "risk" },
  altman_zscore: { icon: <ShieldCheck className="w-4 h-4" />, group: "fundamentals" },
  piotroski_fscore: { icon: <ShieldAlert className="w-4 h-4" />, group: "fundamentals" },
};

const GROUP_ORDER: ModelGroup[] = ["forecast", "risk", "fundamentals"];

const COLOR = {
  good: "text-green-700 dark:text-green-400",
  bad:  "text-red-700 dark:text-red-400",
  warn: "text-yellow-700 dark:text-yellow-400",
  neutral: "text-muted-foreground",
} as const;

function extractSignal(model: any, t: (k: string, v?: any) => string): { value: string; label: string; color: string } {
  const pred = model.prediction_json || {};
  const type = model.model_type;

  if (type === "ensemble") {
    const ret = pred.predicted_3m_return ?? pred.ensemble_return ?? pred.predicted_return;
    const signal = pred.signal || "";
    const color = ret > NEUTRAL_BAND.ensembleReturn ? COLOR.good : ret < -NEUTRAL_BAND.ensembleReturn ? COLOR.bad : COLOR.warn;
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
      label: persistence != null ? t("persistence", { value: persistence.toFixed(2) }) : t("volLabel"),
      color,
    };
  }

  if (type === "monte_carlo") {
    const dist = pred.distribution || {};
    const probProfit = dist.prob_profit ?? pred.prob_profit;
    const color = (probProfit || 0) > 0.55 ? COLOR.good : (probProfit || 0) < 0.45 ? COLOR.bad : COLOR.warn;
    return {
      value: probProfit != null ? `${(probProfit * 100).toFixed(0)}%` : "—",
      label: t("probProfit"),
      color,
    };
  }

  // Return-based forecasters (xgboost, lightgbm, price_predictor, factor_model, lstm_forecast, kronos)
  const ret = pred.predicted_3m_return ?? pred.predicted_return ?? pred.forecast_return;
  if (ret != null) {
    const color = ret > NEUTRAL_BAND.ensembleReturn ? COLOR.good : ret < -NEUTRAL_BAND.ensembleReturn ? COLOR.bad : COLOR.warn;
    return { value: `${(ret * 100).toFixed(1)}%`, label: t("threeMReturn"), color };
  }

  return { value: "—", label: "", color: COLOR.neutral };
}

function timeAgo(iso: string | null, t: (k: string, v?: any) => string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("timeAgo.justNow");
  if (mins < 60) return t("timeAgo.mins", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("timeAgo.hours", { n: hrs });
  const days = Math.floor(hrs / 24);
  return t("timeAgo.days", { n: days });
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
function detailRows(model: any, t: (k: string, v?: any) => string): Array<[string, string]> {
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
  const tt = model.model_type;

  if (pred.current_price != null) rows.push([t("detail.currentPrice"), fmt(pred.current_price)]);
  if (pred.predicted_price_3m != null) rows.push([t("detail.predictedPrice3m"), fmt(pred.predicted_price_3m)]);

  if (tt === "ensemble") {
    const reg = pred.regime || {};
    if (reg.ann_vol_pct != null) {
      const band =
        reg.vol_low_threshold_pct != null && reg.vol_high_threshold_pct != null
          ? ` (band ${reg.vol_low_threshold_pct}–${reg.vol_high_threshold_pct}%)`
          : "";
      rows.push(["Ann Vol", `${reg.ann_vol_pct}%${band}`]);
    }
    if (reg.ou_z_score != null) rows.push(["OU z-score", fmt(reg.ou_z_score)]);
    const u = pred.uncertainty_decomposition;
    if (u && u.epistemic_pct != null) {
      rows.push([
        "Uncertainty",
        `epistemic ${u.epistemic_pct}% / aleatoric ${u.aleatoric_pct ?? "—"}%${u.dominant ? ` — ${u.dominant}` : ""}`,
      ]);
    }
  }
  if (tt === "kronos" || tt === "lstm_forecast") {
    if (pred.architecture) rows.push([t("detail.architecture"), String(pred.architecture)]);
    if (pred.mc_samples != null) rows.push([t("detail.samplePaths"), fmt(pred.mc_samples)]);
  }
  if (tt === "xgboost" || tt === "lightgbm" || tt === "price_predictor") {
    if (pred.r_squared != null) rows.push([t("detail.rSquared"), fmt(pred.r_squared)]);
    if (pred.n_features != null) rows.push([t("detail.features"), fmt(pred.n_features)]);
  }
  if (tt === "factor_model" && pred.factor_exposures) {
    Object.entries(pred.factor_exposures).slice(0, 5).forEach(([k, v]) => rows.push([k, fmt(v)]));
  }
  if (tt === "monte_carlo") {
    const d = pred.distribution || pred;
    if (d.expected_return != null) rows.push([t("detail.expectedReturn"), pct(d.expected_return)]);
    if (d.p05 != null) rows.push([t("detail.p05"), fmt(d.p05)]);
    if (d.p50 != null) rows.push([t("detail.median"), fmt(d.p50)]);
    if (d.p95 != null) rows.push([t("detail.p95"), fmt(d.p95)]);
  }
  if (tt === "garch") {
    if (pred.persistence != null) rows.push([t("detail.persistence"), fmt(pred.persistence)]);
    if (pred.long_run_vol != null) rows.push([t("detail.longRunVol"), pct(pred.long_run_vol)]);
  }
  if (tt === "mean_reversion") {
    if (pred.half_life != null) rows.push([t("detail.halfLife"), fmt(pred.half_life)]);
    if (pred.long_run_mean != null) rows.push([t("detail.longRunMean"), fmt(pred.long_run_mean)]);
  }
  if (tt === "altman_zscore" && pred.ratios) {
    Object.entries(pred.ratios).slice(0, 5).forEach(([k, v]) => rows.push([k, fmt(v)]));
  }
  if (tt === "piotroski_fscore" && pred.checks) {
    const passed = Object.entries(pred.checks).filter(([, v]) => v).map(([k]) => k);
    rows.push([t("detail.passed"), `${passed.length}/9`]);
  }

  if (pred.data_years != null) rows.push([t("detail.dataYears"), fmt(pred.data_years)]);
  if (pred.device) rows.push([t("detail.compute"), String(pred.device)]);

  return rows;
}

function ModelCard({
  model,
  modelTypeKey,
  isEnsemble,
  expanded,
  onToggle,
}: {
  model: any;
  modelTypeKey: ModelTypeKey | null;
  isEnsemble: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("models");
  const icon = modelTypeKey ? MODEL_META[modelTypeKey].icon : <BarChart3 className="w-4 h-4" />;
  const label = modelTypeKey ? t(`meta.${modelTypeKey}.label`) : model.model_type;
  const desc = modelTypeKey ? t(`meta.${modelTypeKey}.desc`) : "";
  const long = modelTypeKey ? t(`meta.${modelTypeKey}.long`) : "";
  const signal = extractSignal(model, t);
  const pred = model.prediction_json || {};
  const hasForecastCurve = Array.isArray(pred?.forecast?.mean) && pred.forecast.mean.length > 1;
  const rows = useMemo(() => detailRows(model, t), [model, t]);

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
        <span className={isEnsemble ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className={`text-xs font-semibold ${isEnsemble ? "text-primary" : "text-foreground"}`}>
          {label}
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
      <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{desc}</div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
          {hasForecastCurve && (
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <span>{t("forecastCurve")}</span>
                {pred.forecast?.p10 && pred.forecast?.p90 && <span>{t("p10p90Band")}</span>}
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

          <p className="text-[11px] leading-relaxed text-muted-foreground">{long}</p>

          {model.run_at && (
            <div className="text-[10px] text-muted-foreground/80">{t("lastRunShort", { ago: timeAgo(model.run_at, t) })}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ModelCards({ ticker }: { ticker: string }) {
  const t = useTranslations("models");
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
        setRunError(t("runFailed"));
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
        setRunError(typeof detail === "string" ? detail : t("failedStart"));
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
      const meta = MODEL_META[m.model_type as ModelTypeKey];
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
              <span>{t("lastRun", { ago: timeAgo(lastRunInfo.last_run, t) })}</span>
            </>
          )}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("running")}
            </span>
          )}
          {generatingThoughts && !isRunning && (
            <span className="flex items-center gap-1.5 text-primary">
              <Brain className="w-3 h-3 animate-pulse" />
              {t("generatingThoughts")}
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
            isRunning ? t("modelsRunningTitle") :
            !lastRunInfo?.can_run ? t("nextAvailable", { when: lastRunInfo?.next_available ? timeAgo(lastRunInfo.next_available, t) : t("tomorrow") }) :
            t("runAllTitle")
          }
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {isRunning ? t("runningShort") : t("runAll")}
        </button>
      </div>

      {/* Grouped model cards */}
      {totalRendered === 0 ? (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-5">
          {GROUP_ORDER.map((g) => {
            const items = grouped[g];
            if (items.length === 0) return null;
            return (
              <section key={g}>
                <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">{t(`group.${g}`)}</h3>
                  <p className="text-[11px] text-muted-foreground">{t(`blurb.${g}`)}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
                  {items.map((model: any) => {
                    const key = model.model_type as ModelTypeKey;
                    const known = key in MODEL_META;
                    return (
                      <ModelCard
                        key={model.model_type}
                        model={model}
                        modelTypeKey={known ? key : null}
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
