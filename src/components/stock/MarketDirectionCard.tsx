"use client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MarketDirectionCardProps {
  horizon: string;
  direction: string;
  priceAction: string;
}

export function MarketDirectionCard({ horizon, direction, priceAction }: MarketDirectionCardProps) {
  const dirLower = (direction || "").toLowerCase();
  const isBullish = dirLower === "bullish";
  const isBearish = dirLower === "bearish";

  return (
    <div
      className={`border rounded-lg p-4 ${
        isBullish
          ? "border-green-500/30 bg-green-500/5"
          : isBearish
          ? "border-red-500/30 bg-red-500/5"
          : "border-slate-600/30 bg-slate-600/5"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400 uppercase tracking-wider">{horizon}</span>
        <div
          className={`flex items-center gap-1 text-xs font-semibold ${
            isBullish ? "text-green-400" : isBearish ? "text-red-400" : "text-slate-400"
          }`}
        >
          {isBullish ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : isBearish ? (
            <TrendingDown className="w-3.5 h-3.5" />
          ) : (
            <Minus className="w-3.5 h-3.5" />
          )}
          {direction}
        </div>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">{priceAction}</p>
    </div>
  );
}
