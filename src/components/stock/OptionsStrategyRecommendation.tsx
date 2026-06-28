"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdownRaw from "react-markdown";
import remarkGfm from "remark-gfm";

// react-markdown v9 ships a stricter return type than React's JSX.Element;
// cast once so the JSX usage below stays clean across @types/react versions.
const ReactMarkdown = ReactMarkdownRaw as unknown as React.FC<{
  children: string;
  remarkPlugins?: unknown[];
}>;
import {
  Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Loader2, TrendingUp, Shield, Target, Activity, AlertTriangle,
  BookOpen, RefreshCw, Info,
} from "lucide-react";
import { stocksApi } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────

interface Leg {
  action: "sell" | "buy";
  type: "call" | "put";
  strike: number;
  expiration: string;
  quantity: number;
  premium_estimate: number;
}

interface Recommendation {
  ticker: string;
  iv_pct: number;
  iv_source: string;
  quant_context?: {
    ensemble_return_pct: number | null;
    ensemble_p10_pct: number | null;
    ensemble_p90_pct: number | null;
    ou_z_score: number | null;
    ann_vol_pct: number | null;
  };
  outlook: { assessment: string; iv_regime: string; reasoning: string };
  strategy: {
    name: string;
    category: "income" | "protection" | "speculation" | "hedge";
    why_this_strategy: string;
  };
  trade_setup: { legs: Leg[]; net_credit: number; days_to_expiration: number };
  economics: {
    max_profit: number;
    max_loss: number;
    breakeven: number[];
    probability_of_profit: number;
    capital_required: number;
    max_return_pct: number;
    annualized_return_pct: number;
  };
  greeks: {
    delta: number; theta: number; gamma: number; vega: number;
    interpretation: string;
  };
  adjustment_plan: string;
  exit_rules: string;
  risks: string;
  data_notes?: string;
  error?: string;
}

interface Position { shares: number; avgCost: number }

// ── Deterministic payoff math (at expiration) ───────────────

function legIntrinsic(leg: Leg, price: number): number {
  const payoff = leg.type === "call"
    ? Math.max(0, price - leg.strike)
    : Math.max(0, leg.strike - price);
  const sign = leg.action === "sell" ? -1 : 1;
  return sign * (payoff - leg.premium_estimate) * 100 * leg.quantity;
}

function buildPayoffSeries(legs: Leg[], currentPrice: number) {
  const strikes = legs.map((l) => l.strike);
  const minStrike = Math.min(...strikes, currentPrice);
  const maxStrike = Math.max(...strikes, currentPrice);
  const span = Math.max(maxStrike - minStrike, currentPrice * 0.15);
  const lo = Math.max(0, minStrike - span);
  const hi = maxStrike + span;
  const step = (hi - lo) / 80;
  const points: { price: number; pnl: number }[] = [];
  for (let p = lo; p <= hi; p += step) {
    points.push({
      price: Math.round(p * 100) / 100,
      pnl: Math.round(legs.reduce((sum, l) => sum + legIntrinsic(l, p), 0)),
    });
  }
  return points;
}

// ── Small renderers ─────────────────────────────────────────

type CategoryKey = "income" | "protection" | "speculation" | "hedge";

const CATEGORY_STYLE: Record<CategoryKey, { color: string; icon: React.ReactNode }> = {
  income:       { color: "text-success border-success/40 bg-success/10",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  protection:   { color: "text-primary border-primary/40 bg-primary/10",              icon: <Shield className="w-3.5 h-3.5" /> },
  speculation:  { color: "text-warning border-warning/40 bg-warning/10",        icon: <Target className="w-3.5 h-3.5" /> },
  hedge:        { color: "text-signal-conflict border-signal-conflict/40 bg-signal-conflict/10",     icon: <Shield className="w-3.5 h-3.5" /> },
};

function Markdown({ children }: { children: string }) {
  return (
    <div className="text-xs text-foreground/80 leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-2 [&_h3]:mb-1 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mt-1.5 [&_h4]:mb-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_strong]:text-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ""}</ReactMarkdown>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "pos" | "neg" | "muted" }) {
  const toneClass = {
    default: "text-foreground",
    pos: "text-success",
    neg: "text-danger",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className={`text-sm font-mono font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function fmtMoney(n: number | null | undefined, signed = true): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n >= 0 ? (signed ? "+" : "") : "−";
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtPct(n: number | null | undefined, from: "unit" | "pct" = "unit"): string {
  if (n == null || Number.isNaN(n)) return "—";
  const pct = from === "unit" ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

// ── Main component ──────────────────────────────────────────

interface Props {
  ticker: string;
  currentPrice: number;
  stockInfo: any;
  thoughts: any;
  /** Arbitrated unified verdict mapped to buy/hold/avoid; preferred over thoughts.verdict. */
  verdictAction?: "buy" | "hold" | "avoid";
  position?: Position;
}

type RiskTol = "conservative" | "moderate" | "aggressive";
type Objective = "income" | "protection" | "speculation" | "balanced" | "repair";

export function OptionsStrategyRecommendation({
  ticker, currentPrice, stockInfo, thoughts, verdictAction, position,
}: Props) {
  const t = useTranslations("options");
  const [riskTol, setRiskTol] = useState<RiskTol | null>(null);
  const [objective, setObjective] = useState<Objective | null>(null);
  const [submittedProfile, setSubmittedProfile] = useState<{ risk: RiskTol; obj: Objective } | null>(null);

  const verdict = verdictAction ?? thoughts?.verdict ?? "hold";
  const conviction = thoughts?.conviction || "medium";
  const beta = stockInfo?.beta || 1.0;
  const high52 = stockInfo?.fifty_two_week_high || currentPrice * 1.25;
  const low52 = stockInfo?.fifty_two_week_low || currentPrice * 0.75;
  const pe = stockInfo?.pe_ratio || stockInfo?.forward_pe || null;

  const isUnderwater = !!position && position.avgCost > currentPrice && currentPrice > 0;
  const lossPerShareStr = isUnderwater ? (position!.avgCost - currentPrice).toFixed(2) : "0";
  const lossPctStr = isUnderwater
    ? (((position!.avgCost - currentPrice) / position!.avgCost) * 100).toFixed(1)
    : "0";

  const body = submittedProfile && {
    current_price: currentPrice,
    verdict, conviction, beta,
    high_52w: high52, low_52w: low52,
    pe: pe || undefined,
    shares: position?.shares,
    cost_basis: position?.avgCost,
    risk_tolerance: submittedProfile.risk,
    objective: submittedProfile.obj,
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery<Recommendation>({
    queryKey: ["options-strategy", ticker, verdict, conviction, position?.avgCost, submittedProfile?.risk, submittedProfile?.obj],
    queryFn: () => stocksApi.optionsStrategyRecommendation(ticker, body!),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
    enabled: currentPrice > 0 && !!submittedProfile,
  });

  const errorMessage = (() => {
    if (data?.error) return data.error;
    if (!error) return null;
    const e = error as { code?: string; message?: string; response?: { status?: number; data?: { detail?: unknown } } };
    if (e.code === "ECONNABORTED") return t("timeout");
    if (e.response?.status) {
      const detail = e.response.data?.detail;
      return `HTTP ${e.response.status}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`;
    }
    return e.message || t("unknownError");
  })();

  const payoffPoints = useMemo(() => {
    if (!data?.trade_setup?.legs?.length) return [];
    return buildPayoffSeries(data.trade_setup.legs, currentPrice);
  }, [data, currentPrice]);

  // ── Empty / loading / error ────────────────────────────────

  // Pre-submission picker: user chooses risk + goal, then clicks Generate
  if (!submittedProfile) {
    const canSubmit = !!riskTol && !!objective;
    return (
      <div className="card p-5 space-y-4">
        <div>
          <div className="text-sm font-semibold text-foreground">{t("title")}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {t("intro")}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{t("riskTolerance")}</div>
          <div className="flex flex-wrap gap-2">
            {(["conservative", "moderate", "aggressive"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRiskTol(r)}
                className={`px-3 py-1.5 rounded text-xs capitalize transition-colors border ${
                  riskTol === r
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-muted/30 hover:bg-muted border-transparent"
                }`}
              >{t(`risk.${r}`)}</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{t("goal")}</div>
          <div className="flex flex-wrap gap-2">
            {([
              { v: "income", label: t("objective.incomeLabel") },
              { v: "protection", label: t("objective.protectionLabel") },
              { v: "speculation", label: t("objective.speculationLabel") },
              { v: "balanced", label: t("objective.balancedLabel") },
              ...(isUnderwater
                ? [{ v: "repair" as const, label: t("objective.repairLabel", { loss: lossPctStr }) }]
                : []),
            ] as const).map((o) => (
              <button
                key={o.v}
                onClick={() => setObjective(o.v)}
                className={`px-3 py-1.5 rounded text-xs transition-colors border ${
                  objective === o.v
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-muted/30 hover:bg-muted border-transparent"
                }`}
              >{o.label}</button>
            ))}
          </div>
          {isUnderwater && (
            <div className="text-[10px] text-warning/80 mt-1">
              {t("repairHelp", { shares: position!.shares, ticker, cost: position!.avgCost.toFixed(2), lossPerShare: lossPerShareStr })}
            </div>
          )}
        </div>

        <button
          onClick={() => riskTol && objective && setSubmittedProfile({ risk: riskTol, obj: objective })}
          disabled={!canSubmit}
          className="w-full px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <Activity className="w-4 h-4" />
          {t("generate")}
        </button>
        <div className="text-[10px] text-muted-foreground/60 text-center">
          {t("disclaimer")}
        </div>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="card p-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("designing")}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="card p-6 text-sm text-warning flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">{t("engineUnavailable")}</div>
          <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
            {errorMessage}
          </div>
          <button
            onClick={() => refetch()}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3 h-3" /> {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const categoryKey: CategoryKey = (data.strategy.category in CATEGORY_STYLE)
    ? (data.strategy.category as CategoryKey)
    : "income";
  const category = CATEGORY_STYLE[categoryKey];

  return (
    <div className="space-y-3">
      {/* Profile controls */}
      <div className="card p-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t("risk")}</span>
          {(["conservative", "moderate", "aggressive"] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setRiskTol(r); setSubmittedProfile({ risk: r, obj: submittedProfile.obj }); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                submittedProfile.risk === r ? "bg-primary/20 text-primary" : "bg-muted/50 hover:bg-muted"
              }`}
            >{t(`risk.${r}`)}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t("goalLabel")}</span>
          {([
            "income", "protection", "speculation", "balanced",
            ...(isUnderwater ? ["repair" as const] : []),
          ] as Objective[]).map((o) => (
            <button
              key={o}
              onClick={() => { setObjective(o); setSubmittedProfile({ risk: submittedProfile.risk, obj: o }); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                submittedProfile.obj === o ? "bg-primary/20 text-primary" : "bg-muted/50 hover:bg-muted"
              }`}
            >{t(`objective.${o}.short`)}</button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-50"
          title={t("rerunTitle")}
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          {t("rerun")}
        </button>
      </div>

      {/* Outlook */}
      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{t("outlook")}</div>
            <div className="text-sm font-semibold text-foreground">{data.outlook.assessment}</div>
            <div className="text-xs text-muted-foreground">{t("iv", { regime: data.outlook.iv_regime })}</div>
          </div>
          <div className="text-[10px] text-muted-foreground/60 text-right shrink-0">
            {t("ivSource")}<span className="font-mono">{data.iv_source}</span><br/>
            {t("ivAnn", { pct: data.iv_pct })}
          </div>
        </div>
        <Markdown>{data.outlook.reasoning}</Markdown>
      </div>

      {/* Strategy card */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-lg font-semibold">{data.strategy.name}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${category.color}`}>
            {category.icon}
            {t(`category.${categoryKey}`)}
          </span>
        </div>
        <Markdown>{data.strategy.why_this_strategy}</Markdown>
      </div>

      {/* Trade setup: legs table */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tradeSetup")}</div>
          <div className="text-xs text-muted-foreground">
            {t("dteNet", {
              dte: data.trade_setup.days_to_expiration,
              kind: data.trade_setup.net_credit >= 0 ? t("kind.credit") : t("kind.debit"),
              amount: fmtMoney(Math.abs(data.trade_setup.net_credit)),
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="text-left py-1.5 font-medium">{t("col.action")}</th>
                <th className="text-left py-1.5 font-medium">{t("col.type")}</th>
                <th className="text-right py-1.5 font-medium">{t("col.strike")}</th>
                <th className="text-left py-1.5 font-medium pl-4">{t("col.expiration")}</th>
                <th className="text-right py-1.5 font-medium">{t("col.qty")}</th>
                <th className="text-right py-1.5 font-medium">{t("col.premium")}</th>
              </tr>
            </thead>
            <tbody>
              {data.trade_setup.legs.map((leg, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  <td className={`py-1.5 font-semibold ${leg.action === "sell" ? "text-danger" : "text-success"}`}>
                    {leg.action.toUpperCase()}
                  </td>
                  <td className="py-1.5 uppercase">{leg.type}</td>
                  <td className="py-1.5 text-right font-mono">${leg.strike.toFixed(2)}</td>
                  <td className="py-1.5 pl-4 text-muted-foreground">{leg.expiration}</td>
                  <td className="py-1.5 text-right font-mono">{leg.quantity}</td>
                  <td className="py-1.5 text-right font-mono">${leg.premium_estimate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Economics + Greeks side-by-side */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("economics")}</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("maxProfit")} value={fmtMoney(data.economics.max_profit)} tone="pos" />
            <Stat label={t("maxLoss")} value={fmtMoney(data.economics.max_loss)} tone="neg" />
            <Stat
              label={data.economics.breakeven.length > 1 ? t("breakevens") : t("breakeven")}
              value={data.economics.breakeven.map((b) => `$${b.toFixed(2)}`).join(", ")}
            />
            <Stat label={t("probProfit")} value={fmtPct(data.economics.probability_of_profit)} />
            <Stat label={t("capitalRequired")} value={fmtMoney(data.economics.capital_required, false)} tone="muted" />
            <Stat label={t("return")} value={t("returnValue", { max: fmtPct(data.economics.max_return_pct, "pct"), ann: fmtPct(data.economics.annualized_return_pct, "pct") })} />
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("greeks")}</div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label={t("delta")} value={data.greeks.delta.toFixed(2)} />
            <Stat label={t("theta")} value={data.greeks.theta.toFixed(2)} />
            <Stat label={t("gamma")} value={data.greeks.gamma.toFixed(2)} />
            <Stat label={t("vega")} value={data.greeks.vega.toFixed(2)} />
          </div>
          <Markdown>{data.greeks.interpretation}</Markdown>
        </div>
      </div>

      {/* Payoff diagram */}
      {payoffPoints.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t("payoff")}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={payoffPoints} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <XAxis
                dataKey="price"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                fontSize={10}
                stroke="currentColor"
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                fontSize={10}
                stroke="currentColor"
                className="text-muted-foreground"
                width={55}
              />
              <Tooltip
                contentStyle={{ background: "rgba(23,23,28,0.95)", border: "1px solid rgba(120,120,130,0.3)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [fmtMoney(v), t("pnl")]}
                labelFormatter={(v: number) => t("price", { price: `$${v.toFixed(2)}` })}
              />
              <ReferenceLine y={0} stroke="rgba(160,160,170,0.4)" strokeDasharray="4 4" />
              <ReferenceLine x={currentPrice} stroke="rgba(96,165,250,0.5)" strokeDasharray="2 4" label={{ value: t("now"), position: "top", fill: "#60a5fa", fontSize: 10 }} />
              {data.economics.breakeven.map((b, i) => (
                <ReferenceLine key={i} x={b} stroke="rgba(251,191,36,0.5)" strokeDasharray="2 4" label={{ value: t("be"), position: "top", fill: "#fbbf24", fontSize: 10 }} />
              ))}
              <Line type="monotone" dataKey="pnl" stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-muted-foreground/60 mt-1">
            {t("payoffNote")}
          </div>
        </div>
      )}

      {/* Adjustment plan + exit rules */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            {t("adjustment")}
          </div>
          <Markdown>{data.adjustment_plan}</Markdown>
        </div>
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            {t("exitRules")}
          </div>
          <Markdown>{data.exit_rules}</Markdown>
        </div>
      </div>

      {/* Risks */}
      <div className="card p-4 space-y-2 border-warning/20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warning">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t("risks")}
        </div>
        <Markdown>{data.risks}</Markdown>
      </div>

      {/* Data note */}
      {data.data_notes && (
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 px-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{data.data_notes}</span>
        </div>
      )}
    </div>
  );
}
