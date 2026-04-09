"use client";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { InfoTip } from "@/components/shared/InfoTip";

function valueColor(v: number): string {
  if (v <= 25) return "#ef4444";   // Extreme Fear
  if (v <= 40) return "#f97316";   // Fear
  if (v <= 60) return "#fbbf24";   // Neutral
  if (v <= 75) return "#86efac";   // Greed
  return "#22c55e";                // Extreme Greed
}

export function CryptoFearGreed() {
  const { data } = useQuery({
    queryKey: ["crypto_fear_greed"],
    queryFn: () => macroApi.dashboard().then((d: any) => null).catch(() => null),
    staleTime: 60_000 * 30,
  });

  // Standalone fetch since it's not in main dashboard yet
  const { data: fng } = useQuery({
    queryKey: ["crypto_fng_direct"],
    queryFn: async () => {
      const res = await fetch("/api/macro/crypto-fear-greed");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000 * 30,
  });

  if (!fng || fng.error) return null;

  const value = fng.value;
  const color = valueColor(value);
  const history = fng.history_7d || [];

  return (
    <div className="bg-muted/40 rounded-lg p-3 border border-border/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          Crypto Fear & Greed
          <InfoTip size={9} tip="Alternative.me Fear & Greed Index for crypto. Combines volatility, volume, social media, BTC dominance, and Google Trends. 0 = Extreme Fear (buy signal historically). 100 = Extreme Greed (sell signal). Contrarian indicator — buy when others are fearful." />
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="text-3xl font-black font-mono"
          style={{ color }}
        >
          {value}
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color }}>
            {fng.classification}
          </div>
          {/* 7-day mini trend */}
          <div className="flex gap-0.5 mt-1">
            {history.slice(0, 7).reverse().map((d: any, i: number) => (
              <div
                key={i}
                className="w-3 rounded-sm"
                style={{
                  height: `${Math.max(4, d.value / 5)}px`,
                  backgroundColor: valueColor(d.value),
                  opacity: 0.5 + (i / 14),
                }}
                title={`${d.label}: ${d.value}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
