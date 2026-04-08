"use client";
import { useQuery } from "@tanstack/react-query";
import { InfoTip } from "@/components/shared/InfoTip";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Instrument {
  key: string;
  label: string;
  value: number;
  change_1d: number;
  change_1m: number;
  sparkline: number[];
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const h = 24;
  const w = 60;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const INSTRUMENT_TIPS: Record<string, string> = {
  DXY: "US Dollar Index — measures USD vs basket of 6 currencies. Rising DXY = tighter financial conditions, headwind for equities and commodities. Falling DXY = easier conditions, tailwind for risk assets and gold.",
  US10Y: "10-Year Treasury Yield — the benchmark risk-free rate. Rising yields = tighter conditions, growth concerns, pressure on growth stocks. Falling yields = flight to safety or easing expectations.",
  Gold: "Gold futures — the ultimate safe haven. Rises during fear, inflation, and USD weakness. Strong gold + weak equities = risk-off regime. Strong gold + strong equities = inflation hedge.",
  Oil: "WTI Crude Oil — the economic activity barometer. Rising oil = demand strength or supply shock (inflationary). Falling oil = demand destruction (recessionary). Watch for divergence vs equities.",
  HYG: "High Yield Corporate Bond ETF — credit market stress gauge. Falling HYG = credit spreads widening, default risk rising, risk-off. Rising HYG = credit markets calm. HYG often leads equity turns by 1-2 weeks.",
  Copper: "Copper futures — 'Dr. Copper' has a PhD in economics. Rising copper = global manufacturing expansion. Falling copper = industrial slowdown. One of the most reliable leading indicators of economic activity.",
};

export function MacroTape() {
  const { data } = useQuery({
    queryKey: ["macro_tape"],
    queryFn: async () => {
      const res = await fetch("/api/macro/macro-tape");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000 * 10,
  });

  const instruments: Instrument[] = data?.instruments || [];
  if (instruments.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          Macro Tape
          <InfoTip tip="Cross-asset macro indicators that provide context for equity positioning. These 6 instruments together tell you about dollar strength, interest rates, inflation expectations, credit stress, and global growth. Divergences between them often signal regime shifts before equities react." />
        </span>
        <span className="text-[9px] text-slate-600">3M sparklines</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border/20">
        {instruments.map((inst) => {
          const up1d = inst.change_1d >= 0;
          const up1m = inst.change_1m >= 0;
          const sparkColor = up1m ? "#22c55e" : "#ef4444";

          return (
            <div key={inst.key} className="bg-card p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                  {inst.label}
                  <InfoTip size={9} tip={INSTRUMENT_TIPS[inst.key] || `${inst.label} — cross-asset macro indicator.`} />
                </span>
              </div>

              <div className="text-sm font-bold font-mono text-slate-200">
                {inst.key === "US10Y" ? `${inst.value}%` :
                 inst.key === "DXY" ? inst.value.toFixed(2) :
                 `$${inst.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              </div>

              <Sparkline data={inst.sparkline} color={sparkColor} />

              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono flex items-center gap-0.5 ${up1d ? "text-green-400" : "text-red-400"}`}>
                  {up1d ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {up1d ? "+" : ""}{inst.change_1d.toFixed(2)}%
                </span>
                <span className={`text-[9px] font-mono ${up1m ? "text-green-500/60" : "text-red-500/60"}`}>
                  1M {up1m ? "+" : ""}{inst.change_1m.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
