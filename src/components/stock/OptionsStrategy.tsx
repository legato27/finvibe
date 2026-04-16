"use client";
import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, TrendingDown, TrendingUp, Shield, Target, Clock,
  Plus, X, Check, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  Trash2, RefreshCw, BookOpen, Percent, Calendar, ArrowRight,
} from "lucide-react";
import {
  useOptionsTrades,
  useAddOptionsTrade,
  useCloseOptionsTrade,
  useDeleteOptionsTrade,
  OptionsTrade,
} from "@/lib/supabase/hooks";
import { stocksApi } from "@/lib/api";
import { useLLMAnalysis } from "@/lib/supabase/hooks";

// ── Types ───────────────────────────────────────────────────

interface OptionsRecommendation {
  strategy: "cash_secured_put" | "covered_call";
  strike_price: number;
  premium_estimate: number;
  expiry_date: string;
  days_to_expiry: number;
  capital_required: number;
  max_return: number;
  max_return_annualized: number;
  breakeven: number;
  risk_reward_ratio: number;
  confidence: number;
  reasoning: string;
  entry_criteria: string;
  exit_criteria: string;
  market_condition: string;
  iv_assessment: string;
}

interface LLMOptionsInference {
  ticker: string;
  current_price: number;
  timestamp: string;
  market_outlook: string;
  iv_environment: string;
  recommendations: OptionsRecommendation[];
  educational_notes: {
    csp_explanation: string;
    income_strategy_explanation: string;
    risk_management: string;
  };
}

// ── LLM Inference Engine ────────────────────────────────────

function generateOptionsInference(
  ticker: string,
  currentPrice: number,
  thoughts: any,
  stockInfo: any,
): LLMOptionsInference {
  const now = new Date();
  const verdict = thoughts?.verdict || "hold";
  const conviction = thoughts?.conviction || "medium";
  const beta = stockInfo?.beta || 1.0;
  const pe = stockInfo?.pe_ratio;
  const high52 = stockInfo?.fifty_two_week_high || currentPrice * 1.2;
  const low52 = stockInfo?.fifty_two_week_low || currentPrice * 0.8;
  const range52 = high52 - low52;
  const pricePosition = range52 > 0 ? (currentPrice - low52) / range52 : 0.5;

  // Estimate IV from beta and 52-week range
  const impliedVol = Math.max(0.15, Math.min(0.80, (range52 / currentPrice) * beta * 0.7));

  // Determine market outlook
  let marketOutlook = "neutral";
  if (verdict === "buy" && conviction === "high") marketOutlook = "bullish";
  else if (verdict === "buy") marketOutlook = "moderately bullish";
  else if (verdict === "avoid" && conviction === "high") marketOutlook = "bearish";
  else if (verdict === "avoid") marketOutlook = "moderately bearish";

  // IV environment assessment
  let ivEnv = "moderate";
  if (impliedVol > 0.45) ivEnv = "elevated — premium selling favorable";
  else if (impliedVol > 0.30) ivEnv = "above average — good for income strategies";
  else if (impliedVol < 0.18) ivEnv = "low — consider waiting for higher IV";

  const recommendations: OptionsRecommendation[] = [];

  // ── Cash Secured Put Recommendations ──────────────────

  // Near-term CSP (30 DTE)
  const csp30Dte = 30;
  const csp30Expiry = new Date(now);
  csp30Expiry.setDate(csp30Expiry.getDate() + csp30Dte);
  // Round to nearest Friday
  const dayOfWeek30 = csp30Expiry.getDay();
  csp30Expiry.setDate(csp30Expiry.getDate() + ((5 - dayOfWeek30 + 7) % 7 || 7));

  // Strike selection: OTM put based on outlook
  const csp30StrikeDiscount = verdict === "buy" ? 0.05 : verdict === "hold" ? 0.08 : 0.12;
  const csp30Strike = Math.round((currentPrice * (1 - csp30StrikeDiscount)) * 100) / 100;
  // Premium estimate using simplified Black-Scholes intuition
  const csp30Premium = Math.round(currentPrice * impliedVol * Math.sqrt(csp30Dte / 365) * 0.4 * (1 - csp30StrikeDiscount) * 100) / 100;
  const csp30Capital = csp30Strike * 100;
  const csp30MaxReturn = (csp30Premium * 100 / csp30Capital) * 100;
  const csp30Annualized = csp30MaxReturn * (365 / csp30Dte);

  let csp30Confidence = 0.5;
  if (verdict === "buy") csp30Confidence += 0.2;
  if (conviction === "high") csp30Confidence += 0.1;
  if (pricePosition < 0.4) csp30Confidence += 0.1; // near 52w low = better CSP
  if (impliedVol > 0.30) csp30Confidence += 0.05;
  csp30Confidence = Math.min(0.95, Math.max(0.2, csp30Confidence));

  recommendations.push({
    strategy: "cash_secured_put",
    strike_price: csp30Strike,
    premium_estimate: csp30Premium,
    expiry_date: csp30Expiry.toISOString().split("T")[0],
    days_to_expiry: csp30Dte,
    capital_required: csp30Capital,
    max_return: csp30MaxReturn,
    max_return_annualized: csp30Annualized,
    breakeven: csp30Strike - csp30Premium,
    risk_reward_ratio: csp30Premium / (csp30Strike - csp30Premium + csp30Premium),
    confidence: csp30Confidence,
    reasoning: verdict === "buy"
      ? `${ticker} has a BUY verdict with ${conviction} conviction. Selling a ${csp30StrikeDiscount * 100}% OTM put lets you get paid to wait for a pullback entry. If assigned, you own shares at $${(csp30Strike - csp30Premium).toFixed(2)} effective cost — below the AI's target.`
      : `${ticker} is rated ${verdict.toUpperCase()}. A wider ${(csp30StrikeDiscount * 100).toFixed(0)}% OTM strike provides a larger safety margin. Premium income is collected regardless of assignment.`,
    entry_criteria: `Enter when ${ticker} is trading near $${currentPrice.toFixed(2)}. Ideal entry on red days or when IV spikes above ${(impliedVol * 100).toFixed(0)}%.`,
    exit_criteria: `Let expire worthless for max profit. Buy back at 50% profit ($${(csp30Premium * 0.5).toFixed(2)}) to free up capital early. Roll down and out if stock drops below $${(csp30Strike * 0.97).toFixed(2)}.`,
    market_condition: marketOutlook,
    iv_assessment: ivEnv,
  });

  // Mid-term CSP (45 DTE) — sweet spot for theta decay
  const csp45Dte = 45;
  const csp45Expiry = new Date(now);
  csp45Expiry.setDate(csp45Expiry.getDate() + csp45Dte);
  const dayOfWeek45 = csp45Expiry.getDay();
  csp45Expiry.setDate(csp45Expiry.getDate() + ((5 - dayOfWeek45 + 7) % 7 || 7));

  const csp45StrikeDiscount = verdict === "buy" ? 0.07 : verdict === "hold" ? 0.10 : 0.15;
  const csp45Strike = Math.round((currentPrice * (1 - csp45StrikeDiscount)) * 100) / 100;
  const csp45Premium = Math.round(currentPrice * impliedVol * Math.sqrt(csp45Dte / 365) * 0.38 * (1 - csp45StrikeDiscount) * 100) / 100;
  const csp45Capital = csp45Strike * 100;
  const csp45MaxReturn = (csp45Premium * 100 / csp45Capital) * 100;
  const csp45Annualized = csp45MaxReturn * (365 / csp45Dte);

  let csp45Confidence = csp30Confidence + 0.05; // 45 DTE is optimal theta decay
  csp45Confidence = Math.min(0.95, csp45Confidence);

  recommendations.push({
    strategy: "cash_secured_put",
    strike_price: csp45Strike,
    premium_estimate: csp45Premium,
    expiry_date: csp45Expiry.toISOString().split("T")[0],
    days_to_expiry: csp45Dte,
    capital_required: csp45Capital,
    max_return: csp45MaxReturn,
    max_return_annualized: csp45Annualized,
    breakeven: csp45Strike - csp45Premium,
    risk_reward_ratio: csp45Premium / (csp45Strike - csp45Premium + csp45Premium),
    confidence: csp45Confidence,
    reasoning: `45 DTE is the sweet spot for theta decay. The ${(csp45StrikeDiscount * 100).toFixed(0)}% OTM strike at $${csp45Strike.toFixed(2)} offers a ${(csp45StrikeDiscount * 100).toFixed(0)}% cushion. ${pe && pe < 20 ? `At ${pe.toFixed(1)}x P/E, the stock is reasonably valued for accumulation.` : pe && pe > 30 ? `P/E of ${pe.toFixed(1)}x is elevated — wider OTM provides margin of safety.` : ""}`,
    entry_criteria: `Sell the $${csp45Strike.toFixed(2)} put when ${ticker} trades at $${currentPrice.toFixed(2)} or higher. Target IV rank above 30% for better premium.`,
    exit_criteria: `Buy back at 50% profit ($${(csp45Premium * 0.5).toFixed(2)}). At 21 DTE, evaluate rolling to next month if still OTM. Close at 2x loss ($${(csp45Premium * 2).toFixed(2)}) to cap downside.`,
    market_condition: marketOutlook,
    iv_assessment: ivEnv,
  });

  // ── Covered Call / Income Strategy ────────────────────

  const cc30Dte = 30;
  const cc30Expiry = new Date(now);
  cc30Expiry.setDate(cc30Expiry.getDate() + cc30Dte);
  const ccDayOfWeek = cc30Expiry.getDay();
  cc30Expiry.setDate(cc30Expiry.getDate() + ((5 - ccDayOfWeek + 7) % 7 || 7));

  const ccStrikeDiscount = verdict === "buy" ? 0.08 : verdict === "hold" ? 0.05 : 0.03;
  const ccStrike = Math.round((currentPrice * (1 + ccStrikeDiscount)) * 100) / 100;
  const ccPremium = Math.round(currentPrice * impliedVol * Math.sqrt(cc30Dte / 365) * 0.35 * 100) / 100;
  const ccCapital = currentPrice * 100;
  const ccMaxReturn = ((ccPremium * 100 + (ccStrike - currentPrice) * 100) / ccCapital) * 100;
  const ccAnnualized = ((ccPremium * 100 / ccCapital) * 100) * (365 / cc30Dte);

  let ccConfidence = 0.45;
  if (verdict === "hold") ccConfidence += 0.15; // CC is ideal for hold
  if (verdict === "buy" && conviction !== "high") ccConfidence += 0.1;
  if (pricePosition > 0.6) ccConfidence += 0.1; // near 52w high
  if (impliedVol > 0.25) ccConfidence += 0.05;
  ccConfidence = Math.min(0.95, Math.max(0.2, ccConfidence));

  recommendations.push({
    strategy: "covered_call",
    strike_price: ccStrike,
    premium_estimate: ccPremium,
    expiry_date: cc30Expiry.toISOString().split("T")[0],
    days_to_expiry: cc30Dte,
    capital_required: ccCapital,
    max_return: ccMaxReturn,
    max_return_annualized: ccAnnualized,
    breakeven: currentPrice - ccPremium,
    risk_reward_ratio: ccPremium / currentPrice,
    confidence: ccConfidence,
    reasoning: verdict === "hold"
      ? `${ticker} is rated HOLD — ideal for covered call income. Sell the $${ccStrike.toFixed(2)} call (${(ccStrikeDiscount * 100).toFixed(0)}% OTM) to generate income while holding shares. Collect $${ccPremium.toFixed(2)}/share premium.`
      : verdict === "buy"
      ? `While ${ticker} is a BUY, selling ${(ccStrikeDiscount * 100).toFixed(0)}% OTM calls generates income with room for upside. Cap gain at $${ccStrike.toFixed(2)} but keep the $${ccPremium.toFixed(2)} premium regardless.`
      : `${ticker} is rated AVOID — if holding shares, selling near-ATM calls ($${ccStrike.toFixed(2)}) maximizes premium collected while preparing for a potential exit.`,
    entry_criteria: `Requires owning 100 shares of ${ticker}. Sell when stock is near resistance around $${(currentPrice * 1.02).toFixed(2)}-$${ccStrike.toFixed(2)}.`,
    exit_criteria: `Let expire worthless for full premium. Buy back at 50% profit. Roll up if stock rallies past $${(ccStrike * 1.02).toFixed(2)} and you want to keep shares.`,
    market_condition: marketOutlook,
    iv_assessment: ivEnv,
  });

  return {
    ticker,
    current_price: currentPrice,
    timestamp: now.toISOString(),
    market_outlook: marketOutlook,
    iv_environment: ivEnv,
    recommendations,
    educational_notes: {
      csp_explanation: `A Cash Secured Put (CSP) involves selling a put option while holding enough cash to buy 100 shares at the strike price. You collect premium upfront. If the stock stays above the strike at expiry, you keep the premium as profit. If it drops below, you buy shares at the strike — but your effective cost basis is reduced by the premium received. CSPs work best on stocks you'd be happy to own at a lower price.`,
      income_strategy_explanation: `The Covered Call strategy generates recurring income on stocks you already own. You sell call options above your cost basis, collecting premium. If the stock stays below the strike, you keep shares + premium. If called away, you profit from the stock appreciation + premium. The "wheel strategy" combines CSPs and covered calls: sell puts to enter positions, then sell calls on assigned shares — creating a continuous income cycle.`,
      risk_management: `Position sizing: Never allocate more than 5% of your portfolio to a single options trade. Set max loss at 2x the premium received. Roll positions at 21 DTE if still viable. Avoid selling options through earnings unless specifically targeting the IV crush. Monitor the overall delta exposure of your options portfolio.`,
    },
  };
}

// ── Confidence Badge ────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = (confidence * 100).toFixed(0);
  const color = confidence >= 0.7 ? "text-green-400 bg-green-500/15 border-green-500/30"
    : confidence >= 0.5 ? "text-yellow-400 bg-yellow-500/15 border-yellow-500/30"
    : "text-red-400 bg-red-500/15 border-red-500/30";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% confidence
    </span>
  );
}

// ── Strategy Card ───────────────────────────────────────────

function StrategyCard({
  rec,
  ticker,
  currentPrice,
  inference,
  onAddTrade,
  isAdding,
}: {
  rec: OptionsRecommendation;
  ticker: string;
  currentPrice: number;
  inference: LLMOptionsInference;
  onAddTrade: (rec: OptionsRecommendation) => void;
  isAdding: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCSP = rec.strategy === "cash_secured_put";

  return (
    <div className={`border rounded-lg p-4 ${
      isCSP ? "border-blue-500/20 bg-blue-500/5" : "border-purple-500/20 bg-purple-500/5"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isCSP ? (
            <Shield className="w-4 h-4 text-blue-400" />
          ) : (
            <DollarSign className="w-4 h-4 text-purple-400" />
          )}
          <span className={`text-sm font-bold uppercase ${isCSP ? "text-blue-400" : "text-purple-400"}`}>
            {isCSP ? "Cash Secured Put" : "Covered Call"}
          </span>
          <ConfidenceBadge confidence={rec.confidence} />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {rec.days_to_expiry} DTE
        </span>
      </div>

      {/* Key Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground">Strike</div>
          <div className="font-mono text-sm font-bold text-foreground">${rec.strike_price.toFixed(2)}</div>
          <div className="text-[9px] text-muted-foreground">
            {isCSP ? `${((1 - rec.strike_price / currentPrice) * 100).toFixed(1)}% below` : `${((rec.strike_price / currentPrice - 1) * 100).toFixed(1)}% above`}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground">Premium</div>
          <div className="font-mono text-sm font-bold text-green-400">${rec.premium_estimate.toFixed(2)}</div>
          <div className="text-[9px] text-muted-foreground">${(rec.premium_estimate * 100).toFixed(0)} per contract</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground">Max Return</div>
          <div className="font-mono text-sm font-bold text-green-400">{rec.max_return.toFixed(1)}%</div>
          <div className="text-[9px] text-muted-foreground">{rec.max_return_annualized.toFixed(0)}% annualized</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground">Breakeven</div>
          <div className="font-mono text-sm font-bold text-foreground">${rec.breakeven.toFixed(2)}</div>
          <div className="text-[9px] text-muted-foreground">{((1 - rec.breakeven / currentPrice) * 100).toFixed(1)}% cushion</div>
        </div>
      </div>

      {/* Capital Required */}
      <div className="flex items-center justify-between bg-accent/30 rounded-md px-3 py-2 mb-3">
        <span className="text-xs text-muted-foreground">Capital Required</span>
        <span className="font-mono text-sm font-semibold">${rec.capital_required.toLocaleString()}</span>
      </div>

      {/* Reasoning */}
      <p className="text-xs text-foreground/80 leading-relaxed mb-3">{rec.reasoning}</p>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors mb-3"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide Details" : "Entry & Exit Criteria"}
      </button>

      {expanded && (
        <div className="space-y-3 mb-3">
          <div className="bg-accent/20 rounded-md p-3">
            <div className="flex items-center gap-1 mb-1">
              <ArrowRight className="w-3 h-3 text-green-400" />
              <span className="text-[10px] font-semibold text-green-400 uppercase">Entry Criteria</span>
            </div>
            <p className="text-xs text-muted-foreground">{rec.entry_criteria}</p>
          </div>
          <div className="bg-accent/20 rounded-md p-3">
            <div className="flex items-center gap-1 mb-1">
              <Target className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-semibold text-blue-400 uppercase">Exit Criteria</span>
            </div>
            <p className="text-xs text-muted-foreground">{rec.exit_criteria}</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-accent/20 rounded-md p-3 flex-1">
              <div className="text-[10px] text-muted-foreground mb-1">Market Condition</div>
              <div className="text-xs font-medium capitalize">{rec.market_condition}</div>
            </div>
            <div className="bg-accent/20 rounded-md p-3 flex-1">
              <div className="text-[10px] text-muted-foreground mb-1">IV Environment</div>
              <div className="text-xs font-medium capitalize">{rec.iv_assessment}</div>
            </div>
          </div>
          <div className="bg-accent/20 rounded-md p-3">
            <div className="text-[10px] text-muted-foreground mb-1">Expiry Date</div>
            <div className="text-xs font-medium flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(rec.expiry_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>
      )}

      {/* Add to Trade */}
      <button
        onClick={() => onAddTrade(rec)}
        disabled={isAdding}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
          isCSP
            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30"
            : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
        } disabled:opacity-50`}
      >
        {isAdding ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
        {isAdding ? "Adding..." : "Add to Trade Journal"}
      </button>
    </div>
  );
}

// ── Close Trade Modal ───────────────────────────────────────

function CloseTradeModal({
  trade,
  onClose,
  onConfirm,
  isClosing,
}: {
  trade: OptionsTrade;
  onClose: () => void;
  onConfirm: (data: { close_price?: number; underlying_price_at_close?: number; status: "closed" | "expired" | "assigned"; outcome_notes?: string }) => void;
  isClosing: boolean;
}) {
  const [closeType, setCloseType] = useState<"closed" | "expired" | "assigned">("closed");
  const [closePrice, setClosePrice] = useState("");
  const [underlyingPrice, setUnderlyingPrice] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-5 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Close Trade — {trade.ticker} ${trade.strike_price} {trade.strategy === "cash_secured_put" ? "P" : "C"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Close Type */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">How was it closed?</label>
          <div className="flex gap-2">
            {(["closed", "expired", "assigned"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCloseType(t)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  closeType === t
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-accent/30 text-muted-foreground border-border/30 hover:bg-accent/50"
                }`}
              >
                {t === "closed" ? "Bought Back" : t === "expired" ? "Expired Worthless" : "Assigned"}
              </button>
            ))}
          </div>
        </div>

        {/* Close Price (for buy-back) */}
        {closeType === "closed" && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Buy-back Premium (per share)</label>
            <input
              type="number"
              step="0.01"
              value={closePrice}
              onChange={(e) => setClosePrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
        )}

        {/* Underlying Price at Close */}
        {closeType === "assigned" && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Stock Price at Assignment</label>
            <input
              type="number"
              step="0.01"
              value={underlyingPrice}
              onChange={(e) => setUnderlyingPrice(e.target.value)}
              placeholder={trade.underlying_price_at_entry?.toFixed(2) || "0.00"}
              className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Outcome Notes (for fine-tuning)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened? Was the thesis correct?"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-xs focus:outline-none focus:border-primary/50 resize-none"
          />
        </div>

        {/* Preview */}
        <div className="bg-accent/20 rounded-lg p-3 text-xs">
          <span className="text-muted-foreground">Premium received: </span>
          <span className="font-mono text-green-400">${(trade.premium * trade.contracts * 100).toFixed(2)}</span>
          {closeType === "closed" && closePrice && (
            <>
              <br />
              <span className="text-muted-foreground">Buy-back cost: </span>
              <span className="font-mono text-red-400">${(parseFloat(closePrice) * trade.contracts * 100).toFixed(2)}</span>
              <br />
              <span className="text-muted-foreground">Net P&L: </span>
              <span className={`font-mono ${(trade.premium - parseFloat(closePrice)) >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${((trade.premium - parseFloat(closePrice)) * trade.contracts * 100).toFixed(2)}
              </span>
            </>
          )}
          {closeType === "expired" && (
            <>
              <br />
              <span className="text-muted-foreground">Net P&L: </span>
              <span className="font-mono text-green-400">${(trade.premium * trade.contracts * 100).toFixed(2)} (max profit)</span>
            </>
          )}
        </div>

        <button
          onClick={() => onConfirm({
            close_price: closeType === "closed" ? parseFloat(closePrice) || 0 : closeType === "expired" ? 0 : undefined,
            underlying_price_at_close: closeType === "assigned" ? parseFloat(underlyingPrice) || undefined : undefined,
            status: closeType,
            outcome_notes: notes || undefined,
          })}
          disabled={isClosing || (closeType === "closed" && !closePrice)}
          className="w-full px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isClosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {isClosing ? "Closing..." : "Confirm Close"}
        </button>
      </div>
    </div>
  );
}

// ── Trade Journal Row ───────────────────────────────────────

function TradeRow({
  trade,
  onClose,
  onDelete,
}: {
  trade: OptionsTrade;
  onClose: (trade: OptionsTrade) => void;
  onDelete: (id: number) => void;
}) {
  const isOpen = trade.status === "open";
  const isCSP = trade.strategy === "cash_secured_put";
  const daysToExpiry = isOpen
    ? Math.max(0, Math.round((new Date(trade.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isExpiring = isOpen && daysToExpiry <= 7;
  const isExpired = isOpen && daysToExpiry <= 0;

  return (
    <div className={`border rounded-lg p-3 ${
      isOpen ? "border-border/30" : trade.was_profitable ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
            isCSP ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
          }`}>
            {isCSP ? "CSP" : "CC"}
          </span>
          <span className="font-mono text-sm font-bold">{trade.ticker}</span>
          <span className="font-mono text-xs text-muted-foreground">${trade.strike_price.toFixed(2)} {isCSP ? "P" : "C"}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${
              isExpired ? "bg-red-500/15 text-red-400 animate-pulse" :
              isExpiring ? "bg-amber-500/15 text-amber-400" :
              "bg-green-500/15 text-green-400"
            }`}>
              {isExpired ? "EXPIRED" : isExpiring ? `${daysToExpiry}d left` : `${daysToExpiry}d`}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase ${
            isOpen ? "bg-blue-500/15 text-blue-400" :
            trade.status === "expired" ? "bg-green-500/15 text-green-400" :
            trade.status === "assigned" ? "bg-amber-500/15 text-amber-400" :
            "bg-muted text-muted-foreground"
          }`}>
            {trade.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[9px] text-muted-foreground">Premium</div>
          <div className="font-mono text-xs text-green-400">${trade.premium.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">{trade.contracts}x Contract{trade.contracts > 1 ? "s" : ""}</div>
          <div className="font-mono text-xs">${(trade.premium * trade.contracts * 100).toFixed(0)}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">Expiry</div>
          <div className="font-mono text-xs">{new Date(trade.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">P&L</div>
          {trade.realized_pnl != null ? (
            <div className={`font-mono text-xs font-bold ${trade.realized_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {trade.realized_pnl >= 0 ? "+" : ""}${trade.realized_pnl.toFixed(0)}
              {trade.return_on_capital != null && (
                <span className="text-[9px] ml-0.5">({(trade.return_on_capital * 100).toFixed(1)}%)</span>
              )}
            </div>
          ) : (
            <div className="font-mono text-xs text-muted-foreground">—</div>
          )}
        </div>
      </div>

      {/* LLM Confidence */}
      {trade.llm_confidence != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="text-[9px] text-muted-foreground">AI Confidence:</div>
          <div className="flex-1 bg-accent/30 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                trade.llm_confidence >= 0.7 ? "bg-green-400" : trade.llm_confidence >= 0.5 ? "bg-yellow-400" : "bg-red-400"
              }`}
              style={{ width: `${trade.llm_confidence * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-mono">{(trade.llm_confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Annualized Return */}
      {trade.annualized_return != null && (
        <div className="mt-1 text-[9px] text-muted-foreground">
          Annualized: <span className={`font-mono ${trade.annualized_return >= 0 ? "text-green-400" : "text-red-400"}`}>
            {(trade.annualized_return * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20">
        {isOpen && (
          <button
            onClick={() => onClose(trade)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-semibold bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Close Trade
          </button>
        )}
        <button
          onClick={() => onDelete(trade.id)}
          className="px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

interface OptionsStrategyProps {
  ticker: string;
  currentPrice: number;
  thoughts: any;
  stockInfo: any;
}

export function OptionsStrategy({ ticker, currentPrice, thoughts, stockInfo }: OptionsStrategyProps) {
  const [inference, setInference] = useState<LLMOptionsInference | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [addingRec, setAddingRec] = useState<string | null>(null);
  const [showEducation, setShowEducation] = useState(false);
  const [closingTrade, setClosingTrade] = useState<OptionsTrade | null>(null);
  const [view, setView] = useState<"recommendations" | "journal">("recommendations");

  const { data: trades = [], isLoading: tradesLoading } = useOptionsTrades(ticker);
  const addTrade = useAddOptionsTrade();
  const closeTrade = useCloseOptionsTrade();
  const deleteTrade = useDeleteOptionsTrade();
  const { data: llmData } = useLLMAnalysis(ticker);

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status !== "open");

  // Auto-generate inference on mount
  const generateInference = useCallback(() => {
    if (!currentPrice || currentPrice <= 0) return;
    setIsGenerating(true);
    // Simulate async LLM call — in production this would hit the backend
    setTimeout(() => {
      const result = generateOptionsInference(
        ticker,
        currentPrice,
        thoughts || llmData?.thoughts_json,
        stockInfo,
      );
      setInference(result);
      setIsGenerating(false);
    }, 800);
  }, [ticker, currentPrice, thoughts, stockInfo, llmData]);

  useEffect(() => {
    generateInference();
  }, [generateInference]);

  async function handleAddTrade(rec: OptionsRecommendation) {
    const key = `${rec.strategy}-${rec.days_to_expiry}`;
    setAddingRec(key);
    try {
      await addTrade.mutateAsync({
        ticker,
        strategy: rec.strategy,
        strike_price: rec.strike_price,
        premium: rec.premium_estimate,
        contracts: 1,
        expiry_date: rec.expiry_date,
        underlying_price_at_entry: currentPrice,
        llm_recommendation: rec,
        llm_confidence: rec.confidence,
        llm_reasoning: rec.reasoning,
        llm_model_version: "vibefin-options-v1",
      });
    } catch (err) {
      console.error("Failed to add trade:", err);
    } finally {
      setAddingRec(null);
    }
  }

  async function handleCloseTrade(data: { close_price?: number; underlying_price_at_close?: number; status: "closed" | "expired" | "assigned"; outcome_notes?: string }) {
    if (!closingTrade) return;
    try {
      await closeTrade.mutateAsync({ id: closingTrade.id, ...data });
      setClosingTrade(null);
    } catch (err) {
      console.error("Failed to close trade:", err);
    }
  }

  // Stats
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  const winRate = closedTrades.length > 0
    ? (closedTrades.filter((t) => t.was_profitable).length / closedTrades.length * 100).toFixed(0)
    : null;
  const avgReturn = closedTrades.length > 0
    ? (closedTrades.reduce((sum, t) => sum + (t.return_on_capital || 0), 0) / closedTrades.length * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground/80">Options Strategy</h2>
            {inference && (
              <span className="text-[10px] text-muted-foreground/60">
                Generated {new Date(inference.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEducation(!showEducation)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-muted-foreground rounded-lg hover:bg-accent/80 transition-colors"
            >
              <BookOpen className="w-3 h-3" />
              Learn
            </button>
            <button
              onClick={generateInference}
              disabled={isGenerating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-muted-foreground rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Market Context Banner */}
        {inference && (
          <div className="flex items-center gap-4 bg-accent/30 rounded-lg px-4 py-2.5 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Outlook:</span>
              <span className={`text-xs font-semibold capitalize ${
                inference.market_outlook.includes("bull") ? "text-green-400" :
                inference.market_outlook.includes("bear") ? "text-red-400" : "text-yellow-400"
              }`}>
                {inference.market_outlook}
              </span>
            </div>
            <div className="h-3 w-px bg-border/30" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">IV:</span>
              <span className="text-xs font-medium text-foreground/80">{inference.iv_environment}</span>
            </div>
            <div className="h-3 w-px bg-border/30" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Price:</span>
              <span className="font-mono text-xs font-bold">${currentPrice.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Trade Stats */}
        {(openTrades.length > 0 || closedTrades.length > 0) && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="text-center bg-accent/20 rounded-lg p-2">
              <div className="text-[9px] text-muted-foreground">Open</div>
              <div className="font-mono text-sm font-bold text-blue-400">{openTrades.length}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2">
              <div className="text-[9px] text-muted-foreground">Total P&L</div>
              <div className={`font-mono text-sm font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}
              </div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2">
              <div className="text-[9px] text-muted-foreground">Win Rate</div>
              <div className="font-mono text-sm font-bold">{winRate ? `${winRate}%` : "—"}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2">
              <div className="text-[9px] text-muted-foreground">Avg Return</div>
              <div className="font-mono text-sm font-bold">{avgReturn ? `${avgReturn}%` : "—"}</div>
            </div>
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30">
          <button
            onClick={() => setView("recommendations")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              view === "recommendations" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Recommendations
          </button>
          <button
            onClick={() => setView("journal")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              view === "journal" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Trade Journal
            {openTrades.length > 0 && (
              <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{openTrades.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Educational Section */}
      {showEducation && inference && (
        <div className="card p-5 space-y-3">
          <h3 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            Options Income Strategies — Quick Guide
          </h3>
          <div className="border border-blue-500/20 bg-blue-500/5 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-400 uppercase mb-2">Cash Secured Put (CSP)</div>
            <p className="text-xs text-foreground/80 leading-relaxed">{inference.educational_notes.csp_explanation}</p>
          </div>
          <div className="border border-purple-500/20 bg-purple-500/5 rounded-lg p-4">
            <div className="text-xs font-semibold text-purple-400 uppercase mb-2">Income Strategy (Covered Call + Wheel)</div>
            <p className="text-xs text-foreground/80 leading-relaxed">{inference.educational_notes.income_strategy_explanation}</p>
          </div>
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
            <div className="flex items-center gap-1 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase">Risk Management</span>
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{inference.educational_notes.risk_management}</p>
          </div>
        </div>
      )}

      {/* Recommendations View */}
      {view === "recommendations" && (
        <>
          {isGenerating && (
            <div className="card p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-xs text-muted-foreground">Analyzing {ticker} for options strategies...</p>
            </div>
          )}

          {!isGenerating && inference && (
            <div className="space-y-3">
              {/* CSP Section */}
              <div className="flex items-center gap-2 px-1">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">Cash Secured Puts</span>
              </div>
              {inference.recommendations
                .filter((r) => r.strategy === "cash_secured_put")
                .map((rec, i) => (
                  <StrategyCard
                    key={`csp-${i}`}
                    rec={rec}
                    ticker={ticker}
                    currentPrice={currentPrice}
                    inference={inference}
                    onAddTrade={handleAddTrade}
                    isAdding={addingRec === `${rec.strategy}-${rec.days_to_expiry}`}
                  />
                ))}

              {/* CC Section */}
              <div className="flex items-center gap-2 px-1 mt-4">
                <DollarSign className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">Income Strategy — Covered Calls</span>
              </div>
              {inference.recommendations
                .filter((r) => r.strategy === "covered_call")
                .map((rec, i) => (
                  <StrategyCard
                    key={`cc-${i}`}
                    rec={rec}
                    ticker={ticker}
                    currentPrice={currentPrice}
                    inference={inference}
                    onAddTrade={handleAddTrade}
                    isAdding={addingRec === `${rec.strategy}-${rec.days_to_expiry}`}
                  />
                ))}
            </div>
          )}

          {!isGenerating && !inference && (
            <div className="card p-8 text-center text-muted-foreground">
              <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Unable to generate recommendations.</p>
              <p className="text-xs mt-1">Ensure stock price data is available.</p>
            </div>
          )}
        </>
      )}

      {/* Trade Journal View */}
      {view === "journal" && (
        <div className="space-y-3">
          {tradesLoading && (
            <div className="card p-6 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          {!tradesLoading && openTrades.length === 0 && closedTrades.length === 0 && (
            <div className="card p-8 text-center text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No trades recorded for {ticker}.</p>
              <p className="text-xs mt-1">Add a trade from the Recommendations tab to start tracking.</p>
            </div>
          )}

          {/* Open Trades */}
          {openTrades.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-1">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">Open Positions</span>
              </div>
              {openTrades.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  onClose={setClosingTrade}
                  onDelete={(id) => deleteTrade.mutate(id)}
                />
              ))}
            </>
          )}

          {/* Closed Trades */}
          {closedTrades.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-1 mt-4">
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                  Closed Trades ({closedTrades.length})
                </span>
              </div>
              {closedTrades.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  onClose={setClosingTrade}
                  onDelete={(id) => deleteTrade.mutate(id)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Close Trade Modal */}
      {closingTrade && (
        <CloseTradeModal
          trade={closingTrade}
          onClose={() => setClosingTrade(null)}
          onConfirm={handleCloseTrade}
          isClosing={closeTrade.isPending}
        />
      )}
    </div>
  );
}
