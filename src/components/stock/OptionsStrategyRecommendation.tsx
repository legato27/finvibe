"use client";
import { useMemo, useState } from "react";
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

const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  income:       { label: "Income",       color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  protection:   { label: "Protection",   color: "text-sky-400 border-sky-500/40 bg-sky-500/10",              icon: <Shield className="w-3.5 h-3.5" /> },
  speculation:  { label: "Speculation",  color: "text-amber-400 border-amber-500/40 bg-amber-500/10",        icon: <Target className="w-3.5 h-3.5" /> },
  hedge:        { label: "Hedge",        color: "text-purple-400 border-purple-500/40 bg-purple-500/10",     icon: <Shield className="w-3.5 h-3.5" /> },
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
    pos: "text-emerald-400",
    neg: "text-red-400",
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
  position?: Position;
}

type RiskTol = "conservative" | "moderate" | "aggressive";
type Objective = "income" | "protection" | "speculation" | "balanced";

export function OptionsStrategyRecommendation({
  ticker, currentPrice, stockInfo, thoughts, position,
}: Props) {
  const [riskTol, setRiskTol] = useState<RiskTol>("moderate");
  const [objective, setObjective] = useState<Objective>("balanced");

  const verdict = thoughts?.verdict || "hold";
  const conviction = thoughts?.conviction || "medium";
  const beta = stockInfo?.beta || 1.0;
  const high52 = stockInfo?.fifty_two_week_high || currentPrice * 1.25;
  const low52 = stockInfo?.fifty_two_week_low || currentPrice * 0.75;
  const pe = stockInfo?.pe_ratio || stockInfo?.forward_pe || null;

  const body = {
    current_price: currentPrice,
    verdict, conviction, beta,
    high_52w: high52, low_52w: low52,
    pe: pe || undefined,
    shares: position?.shares,
    cost_basis: position?.avgCost,
    risk_tolerance: riskTol,
    objective,
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery<Recommendation>({
    queryKey: ["options-strategy", ticker, verdict, conviction, position?.avgCost, riskTol, objective],
    queryFn: () => stocksApi.optionsStrategyRecommendation(ticker, body),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
    enabled: currentPrice > 0,
  });

  const payoffPoints = useMemo(() => {
    if (!data?.trade_setup?.legs?.length) return [];
    return buildPayoffSeries(data.trade_setup.legs, currentPrice);
  }, [data, currentPrice]);

  // ── Empty / loading / error ────────────────────────────────

  if (isLoading) {
    return (
      <div className="card p-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Designing strategy…
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="card p-6 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Strategy engine unavailable</div>
          <div className="text-xs text-muted-foreground mt-1">
            {data?.error || "The LLM returned an invalid response. Retry in a minute."}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const category = CATEGORY_META[data.strategy.category] || CATEGORY_META.income;

  return (
    <div className="space-y-3">
      {/* Profile controls */}
      <div className="card p-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Risk:</span>
          {(["conservative", "moderate", "aggressive"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRiskTol(r)}
              className={`px-2 py-0.5 rounded transition-colors ${
                riskTol === r ? "bg-primary/20 text-primary" : "bg-muted/50 hover:bg-muted"
              }`}
            >{r}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Goal:</span>
          {(["income", "protection", "speculation", "balanced"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setObjective(o)}
              className={`px-2 py-0.5 rounded transition-colors ${
                objective === o ? "bg-primary/20 text-primary" : "bg-muted/50 hover:bg-muted"
              }`}
            >{o}</button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-50"
          title="Re-run strategist"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Re-run
        </button>
      </div>

      {/* Outlook */}
      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Outlook</div>
            <div className="text-sm font-semibold text-foreground">{data.outlook.assessment}</div>
            <div className="text-xs text-muted-foreground">IV: {data.outlook.iv_regime}</div>
          </div>
          <div className="text-[10px] text-muted-foreground/60 text-right shrink-0">
            IV source: <span className="font-mono">{data.iv_source}</span><br/>
            {data.iv_pct}% ann.
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
            {category.label}
          </span>
        </div>
        <Markdown>{data.strategy.why_this_strategy}</Markdown>
      </div>

      {/* Trade setup: legs table */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trade Setup</div>
          <div className="text-xs text-muted-foreground">
            {data.trade_setup.days_to_expiration} DTE · Net {data.trade_setup.net_credit >= 0 ? "credit" : "debit"}: {fmtMoney(Math.abs(data.trade_setup.net_credit))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="text-left py-1.5 font-medium">Action</th>
                <th className="text-left py-1.5 font-medium">Type</th>
                <th className="text-right py-1.5 font-medium">Strike</th>
                <th className="text-left py-1.5 font-medium pl-4">Expiration</th>
                <th className="text-right py-1.5 font-medium">Qty</th>
                <th className="text-right py-1.5 font-medium">Premium</th>
              </tr>
            </thead>
            <tbody>
              {data.trade_setup.legs.map((leg, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  <td className={`py-1.5 font-semibold ${leg.action === "sell" ? "text-rose-400" : "text-emerald-400"}`}>
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
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Economics</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Max profit" value={fmtMoney(data.economics.max_profit)} tone="pos" />
            <Stat label="Max loss" value={fmtMoney(data.economics.max_loss)} tone="neg" />
            <Stat
              label={data.economics.breakeven.length > 1 ? "Breakevens" : "Breakeven"}
              value={data.economics.breakeven.map((b) => `$${b.toFixed(2)}`).join(", ")}
            />
            <Stat label="Prob. profit" value={fmtPct(data.economics.probability_of_profit)} />
            <Stat label="Capital required" value={fmtMoney(data.economics.capital_required, false)} tone="muted" />
            <Stat label="Return" value={`${fmtPct(data.economics.max_return_pct, "pct")} / ${fmtPct(data.economics.annualized_return_pct, "pct")} ann.`} />
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Greeks</div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Δ Delta" value={data.greeks.delta.toFixed(2)} />
            <Stat label="Θ Theta" value={data.greeks.theta.toFixed(2)} />
            <Stat label="Γ Gamma" value={data.greeks.gamma.toFixed(2)} />
            <Stat label="ν Vega" value={data.greeks.vega.toFixed(2)} />
          </div>
          <Markdown>{data.greeks.interpretation}</Markdown>
        </div>
      </div>

      {/* Payoff diagram */}
      {payoffPoints.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Payoff at Expiration
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
                formatter={(v: number) => [fmtMoney(v), "P&L"]}
                labelFormatter={(v: number) => `Price: $${v.toFixed(2)}`}
              />
              <ReferenceLine y={0} stroke="rgba(160,160,170,0.4)" strokeDasharray="4 4" />
              <ReferenceLine x={currentPrice} stroke="rgba(96,165,250,0.5)" strokeDasharray="2 4" label={{ value: "Now", position: "top", fill: "#60a5fa", fontSize: 10 }} />
              {data.economics.breakeven.map((b, i) => (
                <ReferenceLine key={i} x={b} stroke="rgba(251,191,36,0.5)" strokeDasharray="2 4" label={{ value: "BE", position: "top", fill: "#fbbf24", fontSize: 10 }} />
              ))}
              <Line type="monotone" dataKey="pnl" stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-muted-foreground/60 mt-1">
            Computed from the leg payoffs above. Max-loss and max-profit zones are clamped on the graph tails.
          </div>
        </div>
      )}

      {/* Adjustment plan + exit rules */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            Adjustment plan
          </div>
          <Markdown>{data.adjustment_plan}</Markdown>
        </div>
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            Exit rules
          </div>
          <Markdown>{data.exit_rules}</Markdown>
        </div>
      </div>

      {/* Risks */}
      <div className="card p-4 space-y-2 border-amber-500/20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          Risks
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
