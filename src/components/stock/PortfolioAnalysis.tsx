"use client";
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import { FinVibeThoughts } from "./FinVibeThoughts";
import { TechnicalAnalysis } from "./TechnicalAnalysis";
import { ModelCards } from "./ModelCards";
import {
  TrendingUp, TrendingDown, Minus, PlusCircle, MinusCircle,
  LogOut, Loader2, AlertTriangle, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface Position { shares: number; avgCost: number }

interface PortfolioAnalysisProps {
  ticker: string;
  currentPrice: number;
  position: Position;
  stockInfo: any;
  thoughts: any;
  thoughtsGeneratedAt: string | null;
  thoughtsData: any;
  isGenerating: boolean;
  onGenerate: () => void;
  onGenerateDone: () => void;
}

// ── Action config ─────────────────────────────────────────────

const ACTION_CONFIG = {
  add: {
    label: "Add to Position",
    icon: PlusCircle,
    bg: "bg-green-500/15",
    text: "text-green-400",
    border: "border-green-500/30",
    ring: "#22c55e",
  },
  hold: {
    label: "Hold",
    icon: Minus,
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    ring: "#eab308",
  },
  reduce: {
    label: "Reduce Position",
    icon: MinusCircle,
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/30",
    ring: "#f97316",
  },
  exit: {
    label: "Exit Position",
    icon: LogOut,
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    ring: "#ef4444",
  },
} as const;

// ── Confidence arc ─────────────────────────────────────────────

function ConfidenceArc({ value, color }: { value: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
      />
      <text
        x="36" y="40" textAnchor="middle"
        className="fill-foreground font-bold text-[13px]"
        style={{ rotate: "90deg", transformOrigin: "36px 36px", fontSize: 13 }}
      >
        {value}
      </text>
    </svg>
  );
}

// ── Position Advice card ──────────────────────────────────────

function PositionAdviceCard({
  ticker, position, currentPrice, stockInfo, thoughts,
}: {
  ticker: string;
  position: Position;
  currentPrice: number;
  stockInfo: any;
  thoughts: any;
}) {
  const pnlPct = ((currentPrice - position.avgCost) / position.avgCost) * 100;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["position-advice", ticker, position.avgCost, currentPrice],
    queryFn: () =>
      stocksApi.positionAdvice(ticker, {
        current_price: currentPrice,
        avg_cost: position.avgCost,
        shares: position.shares,
        verdict: thoughts?.verdict || "hold",
        conviction: thoughts?.conviction || "medium",
        iv_pct: stockInfo?.implied_volatility ? stockInfo.implied_volatility * 100 : 30,
        beta: stockInfo?.beta || 1.0,
        high_52w: stockInfo?.fifty_two_week_high || null,
        low_52w: stockInfo?.fifty_two_week_low || null,
        pe: stockInfo?.pe_ratio || null,
      }),
    enabled: !!ticker && currentPrice > 0,
    staleTime: 7_200_000,
    retry: 1,
  });

  const action = (data?.action || "hold") as keyof typeof ACTION_CONFIG;
  const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.hold;
  const ActionIcon = cfg.icon;
  const confidence = data?.confidence ?? 50;

  if (isLoading) {
    return (
      <div className="card p-5 flex items-center gap-3 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        AI is analysing your position…
      </div>
    );
  }

  if (isError || data?.error) {
    return (
      <div className="card p-5 flex items-center justify-between text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          Position advice unavailable (LLM offline)
        </div>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`card p-5 border ${cfg.border}`}>
      <div className="flex items-start gap-4">
        {/* Confidence arc */}
        <div className="relative shrink-0">
          <ConfidenceArc value={confidence} color={cfg.ring} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[11px] font-bold ${cfg.text}`} style={{ marginTop: 2 }}>
              {confidence}
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
              <ActionIcon className="w-3.5 h-3.5" />
              {cfg.label}
            </span>
            {data?.headline && (
              <span className="text-sm font-semibold text-foreground/90">{data.headline}</span>
            )}
          </div>

          {data?.reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">{data.reasoning}</p>
          )}

          {data?.key_factors?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {data.key_factors.map((f: string, i: number) => (
                <span key={i} className="text-[10px] px-2 py-0.5 bg-accent/60 rounded text-muted-foreground">
                  {f}
                </span>
              ))}
            </div>
          )}

          {(data?.target_price || data?.stop_loss) && (
            <div className="flex gap-4 mt-3 pt-2 border-t border-border/20">
              {data.target_price && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</div>
                  <div className="text-sm font-mono font-semibold text-green-400">${Number(data.target_price).toFixed(2)}</div>
                </div>
              )}
              {data.stop_loss && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Stop Loss</div>
                  <div className="text-sm font-mono font-semibold text-red-400">${Number(data.stop_loss).toFixed(2)}</div>
                </div>
              )}
              <div className="ml-auto">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Unrealised P&L</div>
                <div className={`text-sm font-mono font-semibold ${pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {pnlPct >= 0 ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />}
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export function PortfolioAnalysis({
  ticker,
  currentPrice,
  position,
  stockInfo,
  thoughts,
  thoughtsGeneratedAt,
  thoughtsData,
  isGenerating,
  onGenerate,
  onGenerateDone,
}: PortfolioAnalysisProps) {
  return (
    <div className="space-y-4">
      {/* Position recommendation */}
      <PositionAdviceCard
        ticker={ticker}
        position={position}
        currentPrice={currentPrice}
        stockInfo={stockInfo}
        thoughts={thoughts}
      />

      {/* FinVibe AI thoughts */}
      <FinVibeThoughts
        ticker={ticker}
        thoughts={thoughts}
        generatedAt={thoughtsGeneratedAt}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onGenerateDone={onGenerateDone}
        llmIntrinsicValue={thoughtsData?.llm_intrinsic_value ?? null}
        llmMarginOfSafety={thoughtsData?.llm_margin_of_safety ?? null}
      />

      {/* Technical analysis */}
      <TechnicalAnalysis ticker={ticker} />

      {/* Quant models */}
      <ModelCards ticker={ticker} />
    </div>
  );
}
