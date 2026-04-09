"use client";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

const REGIME_COLORS: Record<string, string> = {
  long_gamma: "#22c55e",
  positive_gamma: "#86efac",
  neutral_gamma: "#fbbf24",
  negative_gamma: "#f97316",
  deep_negative: "#ef4444",
};

export function GexCard() {
  const { data: gex } = useQuery({
    queryKey: ["gex"],
    queryFn: macroApi.gex,
    staleTime: 60_000 * 5,
  });

  if (!gex || gex.error) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Loading GEX...</div>
      </div>
    );
  }

  const color = REGIME_COLORS[gex.regime] || "#94a3b8";
  const isPositive = gex.net_gex > 0;

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <span className="card-title flex items-center gap-1">
            Dealer GEX
            <InfoTip tip="Gamma Exposure (GEX) measures how much options market-makers (dealers) need to hedge. POSITIVE GEX: dealers sell rallies & buy dips = low volatility, mean-reverting market. NEGATIVE GEX: dealers buy rallies & sell dips = amplified moves, trending/volatile market. This is the #1 intraday regime indicator for SPX/QQQ." />
          </span>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}44` }}
        >
          {gex.regime.replace(/_/g, " ").toUpperCase()}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {/* Net GEX */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              Net GEX <InfoTip size={10} tip="Net Gamma Exposure = Call GEX + Put GEX. Positive = dealers dampen volatility (sell high, buy low). Negative = dealers amplify moves. Large positive = expect tight ranges. Large negative = expect big swings." />
            </div>
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span
                className="text-2xl font-bold font-mono"
                style={{ color }}
              >
                {gex.net_gex > 0 ? "+" : ""}{gex.net_gex}{gex.net_gex_unit || "M"}
              </span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2 text-center">
            <div className="bg-muted/50 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">Call GEX</div>
              <div className="font-mono text-xs text-green-400">{gex.call_gex}{gex.net_gex_unit || "M"}</div>
            </div>
            <div className="bg-muted/50 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">Put GEX</div>
              <div className="font-mono text-xs text-red-400">{gex.put_gex}{gex.net_gex_unit || "M"}</div>
            </div>
          </div>
        </div>

        {/* Zero-Gamma Level */}
        {gex.zero_gamma_level && (
          <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  Zero-Gamma <InfoTip size={10} tip="The price level where dealer gamma flips from positive to negative. ABOVE zero-gamma: dealers suppress vol (buy dips). BELOW zero-gamma: dealers amplify selling (sell dips). When SPY drops below this level, expect accelerated selling and higher volatility." />
                </div>
                <div className="text-lg font-bold font-mono text-amber-400">
                  ${gex.zero_gamma_level}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">SPY Spot</div>
                <div className="text-sm font-mono text-foreground">${gex.spot}</div>
              </div>
              {gex.distance_to_zero != null && (
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">Distance</div>
                  <div className={`text-sm font-mono font-bold ${gex.distance_to_zero > 0 ? "text-green-400" : "text-red-400"}`}>
                    {gex.distance_to_zero > 0 ? "+" : ""}{gex.distance_to_zero}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Regime description */}
        <p className="text-xs text-muted-foreground italic leading-relaxed">{gex.regime_description}</p>
      </div>
    </div>
  );
}
