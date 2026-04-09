"use client";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Bitcoin, Coins } from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  momentum: "bullish" | "bearish";
  ma7: number;
  ma30: number;
}

function CoinRow({ data, icon }: { data: CryptoData; icon: React.ReactNode }) {
  const up = data.change_24h >= 0;
  return (
    <div className="flex items-center gap-3 py-2">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{data.name}</span>
          <span className={`text-[9px] px-1 py-0 rounded ${
            data.momentum === "bullish" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
          }`}>{data.momentum === "bullish" ? "Bull" : "Bear"}</span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          7D ${data.ma7?.toLocaleString()} · 30D ${data.ma30?.toLocaleString()}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold font-mono">
          ${data.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={`text-xs font-mono flex items-center gap-0.5 justify-end ${up ? "text-green-400" : "text-red-400"}`}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {up ? "+" : ""}{data.change_24h?.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function fngColor(v: number): string {
  if (v <= 25) return "#ef4444";
  if (v <= 40) return "#f97316";
  if (v <= 60) return "#fbbf24";
  if (v <= 75) return "#86efac";
  return "#22c55e";
}

export function CryptoIndicators() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["crypto_indicators"],
    queryFn: async () => {
      const res = await fetch("/api/crypto/indicators");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });

  const { data: fng } = useQuery({
    queryKey: ["crypto_fng"],
    queryFn: async () => {
      const res = await fetch("/api/macro/crypto-fear-greed");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000 * 30,
  });

  if (isLoading) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Loading crypto...</div>
      </div>
    );
  }

  const btc = data?.["BTC-USD"];
  const eth = data?.["ETH-USD"];
  const sol = data?.["SOL-USD"];

  if (error || !btc) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Crypto data unavailable</div>
      </div>
    );
  }

  const hasFng = fng && !fng.error;

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header flex-shrink-0">
        <span className="card-title flex items-center gap-1">
          Crypto
          <InfoTip tip="Live crypto prices from Binance. Momentum is based on 7-day vs 30-day moving average crossover. Bullish = price above both MAs and 7D > 30D. Bearish = price below MAs or 7D < 30D." />
        </span>
        <span className="text-[10px] text-muted-foreground">Live</span>
      </div>
      <div className="flex-1 divide-y divide-border/30">
        <CoinRow data={btc} icon={<Bitcoin className="w-5 h-5 text-orange-400 flex-shrink-0" />} />
        {eth && <CoinRow data={eth} icon={<Coins className="w-5 h-5 text-blue-400 flex-shrink-0" />} />}
        {sol && <CoinRow data={sol} icon={<Coins className="w-5 h-5 text-purple-400 flex-shrink-0" />} />}
      </div>

      {/* Fear & Greed Index — last row */}
      {hasFng && (
        <div className="border-t border-border/30 pt-2 mt-1">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 mb-1">
                Fear & Greed Index
                <InfoTip size={9} tip="Alternative.me Fear & Greed Index for crypto. Combines volatility, volume, social media, BTC dominance, and Google Trends. 0 = Extreme Fear (historically a buy signal). 100 = Extreme Greed (sell signal). A contrarian indicator — be greedy when others are fearful." />
              </div>
              {/* Gauge bar */}
              <div className="relative w-full h-2 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 opacity-30">
                <div
                  className="absolute top-0 h-full w-2 rounded-full bg-white shadow-md shadow-white/40"
                  style={{ left: `calc(${fng.value}% - 4px)` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground/60 mt-0.5">
                <span>Fear</span>
                <span>Greed</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-black font-mono" style={{ color: fngColor(fng.value) }}>
                {fng.value}
              </div>
              <div className="text-[10px] font-medium" style={{ color: fngColor(fng.value) }}>
                {fng.classification}
              </div>
            </div>
          </div>
          {/* 7-day mini bars */}
          {fng.history_7d?.length > 0 && (
            <div className="flex gap-0.5 mt-1.5 items-end h-4">
              {fng.history_7d.slice(0, 7).reverse().map((d: any, i: number) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm min-w-0"
                  style={{
                    height: `${Math.max(15, (d.value / 100) * 100)}%`,
                    backgroundColor: fngColor(d.value),
                    opacity: 0.4 + (i / 10),
                  }}
                  title={`${d.label}: ${d.value}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
