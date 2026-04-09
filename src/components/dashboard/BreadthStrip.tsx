"use client";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { BarChart3 } from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

function BreadthCell({ label, value, suffix = "%", change }: {
  label: string; value?: number; suffix?: string; change?: number;
}) {
  const color = value == null ? "text-muted-foreground/60"
    : value > 60 ? "text-green-400"
    : value > 40 ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="flex-1 text-center px-2 py-2">
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>
        {value != null ? `${value}${suffix}` : "—"}
      </div>
      {change != null && (
        <div className={`text-[10px] font-mono ${change >= 0 ? "text-green-500" : "text-red-500"}`}>
          {change >= 0 ? "+" : ""}{change}{suffix}
        </div>
      )}
    </div>
  );
}

export function BreadthStrip() {
  const { data: breadth } = useQuery({
    queryKey: ["breadth"],
    queryFn: macroApi.breadth,
    staleTime: 60_000 * 5,
  });

  if (!breadth || breadth.error) {
    return null; // silent fail — strip just doesn't show
  }

  const signalColor = breadth.signal === "broad_strength" ? "text-green-400 bg-green-500/10"
    : breadth.signal === "broad_weakness" ? "text-red-400 bg-red-500/10"
    : breadth.signal === "narrowing" ? "text-amber-400 bg-amber-500/10"
    : "text-muted-foreground bg-muted";

  return (
    <div className="card">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            Market Breadth
            <InfoTip tip="Breadth measures how many stocks participate in a market move. BROAD (>70% above MAs) = healthy, sustainable rally. NARROW (<30%) = weak, only a few stocks leading. Breadth divergences (index rising but breadth falling) are classic warning signals of a coming reversal." />
          </span>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${signalColor}`}>
          {breadth.signal?.replace(/_/g, " ").toUpperCase()}
        </span>
      </div>
      <div className="flex divide-x divide-border/30">
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
            % &gt; 50 DMA <InfoTip size={10} tip="Percentage of S&P 500 stocks trading above their 50-day moving average. This measures short-term momentum. >70% = strong breadth, broad rally. <30% = weak, most stocks in short-term downtrends. Useful for timing: extreme low readings often mark short-term bottoms." />
          </div>
          <div className={`text-lg font-bold font-mono ${(breadth.pct_above_50dma ?? 50) > 60 ? "text-green-400" : (breadth.pct_above_50dma ?? 50) > 40 ? "text-yellow-400" : "text-red-400"}`}>
            {breadth.pct_above_50dma != null ? `${breadth.pct_above_50dma}%` : "—"}
          </div>
          {breadth.pct_above_50dma_chg != null && (
            <div className={`text-[10px] font-mono ${breadth.pct_above_50dma_chg >= 0 ? "text-green-500" : "text-red-500"}`}>
              {breadth.pct_above_50dma_chg >= 0 ? "+" : ""}{breadth.pct_above_50dma_chg}%
            </div>
          )}
        </div>
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
            % &gt; 200 DMA <InfoTip size={10} tip="Percentage of stocks above their 200-day moving average. This measures long-term trend health. >65% = broad bull market. <40% = bear market conditions. The 200 DMA is the most-watched MA by institutions — being above it defines an 'uptrend'." />
          </div>
          <div className={`text-lg font-bold font-mono ${(breadth.pct_above_200dma ?? 50) > 60 ? "text-green-400" : (breadth.pct_above_200dma ?? 50) > 40 ? "text-yellow-400" : "text-red-400"}`}>
            {breadth.pct_above_200dma != null ? `${breadth.pct_above_200dma}%` : "—"}
          </div>
          {breadth.pct_above_200dma_chg != null && (
            <div className={`text-[10px] font-mono ${breadth.pct_above_200dma_chg >= 0 ? "text-green-500" : "text-red-500"}`}>
              {breadth.pct_above_200dma_chg >= 0 ? "+" : ""}{breadth.pct_above_200dma_chg}%
            </div>
          )}
        </div>
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
            A/D Ratio <InfoTip size={10} tip="Advance/Decline ratio — how many stocks went up vs down today. >1.5 = strong buying pressure across the board. <0.7 = broad selling. A rising market with falling A/D ratio = bearish divergence (narrow rally, few leaders)." />
          </div>
          <div className={`text-lg font-bold font-mono ${(breadth.adv_dec_ratio ?? 1) > 1.2 ? "text-green-400" : (breadth.adv_dec_ratio ?? 1) > 0.8 ? "text-yellow-400" : "text-red-400"}`}>
            {breadth.adv_dec_ratio ?? "—"}
          </div>
        </div>
        <div className="flex-1 text-center px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
            NH – NL <InfoTip size={10} tip="New 20-day Highs minus New 20-day Lows. Positive = more stocks making new highs (bullish). Negative = more stocks making new lows (bearish). Persistent negative readings during a rally = hidden weakness under the surface." />
          </div>
          <div className={`text-lg font-bold font-mono ${(breadth.new_highs_lows ?? 0) > 0 ? "text-green-400" : (breadth.new_highs_lows ?? 0) < 0 ? "text-red-400" : "text-yellow-400"}`}>
            {breadth.new_highs_lows ?? "—"}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground px-3 pb-2 italic">{breadth.description}</p>
    </div>
  );
}
