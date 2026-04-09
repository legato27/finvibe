"use client";
import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { InfoTip } from "@/components/shared/InfoTip";

const STATES = ["Expansion", "Peak", "Contraction", "Trough"] as const;
type CycleState = typeof STATES[number];

const STATE_CONFIG: Record<CycleState, {
  color: string;
  icon: string;
  abbr: string;
  phase: string;
  desc: string;
  signal: string;
  detail: string;
  assets: string[];
}> = {
  Expansion: {
    color: "#22c55e",
    icon: "↑",
    abbr: "EXPN",
    phase: "Expansion",
    desc: "Rising GDP, employment & consumer spending",
    signal: "Risk-On",
    detail: "Economy growing above trend. Corporate earnings rise, unemployment falls, central banks tighten. Equities outperform bonds.",
    assets: ["Equities", "Cyclicals", "Real Estate", "Commodities"],
  },
  Peak: {
    color: "#f59e0b",
    icon: "⬆",
    abbr: "PEAK",
    phase: "Peak",
    desc: "Max growth, inflation pressure, rate peak",
    signal: "Rotate Defensive",
    detail: "Growth at its highest but beginning to slow. Inflation elevated, rates at or near peak. Prefer value/dividend stocks and reduce duration.",
    assets: ["Value Stocks", "Energy", "Materials", "Short Duration"],
  },
  Contraction: {
    color: "#ef4444",
    icon: "↓",
    abbr: "CONT",
    phase: "Contraction",
    desc: "Slowing growth, rising unemployment, rate cuts",
    signal: "Risk-Off",
    detail: "GDP decelerates or turns negative. Unemployment rises, earnings disappoint. Central banks pivot to cuts. Bonds and defensives outperform.",
    assets: ["Government Bonds", "Utilities", "Healthcare", "Gold"],
  },
  Trough: {
    color: "#8b5cf6",
    icon: "↗",
    abbr: "TRGH",
    phase: "Trough",
    desc: "Economic bottom, cheap assets, stimulus begins",
    signal: "Accumulate",
    detail: "Economy at or near bottom. Asset valuations depressed, stimulus underway. Markets price the recovery — strong entry point for equities.",
    assets: ["Growth Equities", "Small Caps", "High Yield", "Emerging Mkts"],
  },
};

const INDICATOR_LABELS: Record<string, string> = {
  yield_curve_spread: "Yield Curve",
  yield_curve: "Yield Curve",
  unemployment_rate: "Unemployment",
  unemployment: "Unemployment",
  cpi_yoy_pct: "CPI YoY %",
  cpi_yoy: "CPI YoY %",
  industrial_prod_yoy_pct: "Industrial Prod",
  industrial_prod_yoy: "Industrial Prod",
  consumer_sentiment: "Consumer Sent.",
};

function getIndicatorLabel(key: string): string {
  return INDICATOR_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b(pct|yoy)\b/gi, "").trim();
}

export function BusinessCycleWheel() {
  const cycle = useAppStore((s) => s.macro.businessCycle);
  const [showLegend, setShowLegend] = useState(false);

  if (!cycle) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Detecting Cycle...</div>
      </div>
    );
  }

  const currentState = (cycle.state ?? "Expansion") as CycleState;
  const currentConfig = STATE_CONFIG[currentState] ?? STATE_CONFIG.Expansion;
  const cx = 88, cy = 88, r = 66;

  return (
    <div className="card h-full">
      {/* Header */}
      <div className="card-header">
        <span className="card-title flex items-center gap-1">
          Business Cycle
          <InfoTip tip="Identifies the current phase of the economic cycle using a Hidden Markov Model on 5 macro indicators (yield curve, unemployment, CPI, industrial production, consumer sentiment). EXPANSION: growth accelerating, buy cyclicals/growth. PEAK: growth slowing, rotate to defensives. CONTRACTION: recession, buy bonds/utilities/staples. TROUGH: recovery starting, buy beaten-down cyclicals — historically the best entry point for equities." />
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border hover:border-primary/50 transition-colors"
          >
            {showLegend ? "Hide Legend" : "? Legend"}
          </button>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{
              color: currentConfig.color,
              backgroundColor: `${currentConfig.color}22`,
              border: `1px solid ${currentConfig.color}44`,
            }}
          >
            {currentConfig.phase}
          </span>
        </div>
      </div>

      {/* Legend panel */}
      {showLegend && (
        <div className="mb-3 rounded-lg border border-border/60 bg-muted/60 p-3 text-xs space-y-3">
          <div className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
            Cycle Phase Guide — HMM (4-State Gaussian)
          </div>
          {STATES.map((s) => {
            const cfg = STATE_CONFIG[s];
            const isActive = s === currentState;
            return (
              <div key={s} className={`flex gap-2.5 p-2 rounded ${isActive ? "bg-muted/70" : ""}`}>
                <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold" style={{ color: cfg.color }}>{cfg.phase}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}
                    >
                      {cfg.signal}
                    </span>
                    {isActive && <span className="text-[10px] text-muted-foreground">← current</span>}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{cfg.detail}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-muted-foreground">Favour: </span>
                    {cfg.assets.map((a) => (
                      <span key={a} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground">{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border">
            Model: Gaussian HMM trained on FRED data (T10Y2Y, UNRATE, CPI, INDPRO). States mapped by yield-curve mean.
          </p>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* SVG Wheel */}
        <svg width={176} height={176} className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--perf-null, #1e293b)" strokeWidth={20} />

          {STATES.map((state, i) => {
            const startAngle = -90 + i * 90;
            const endAngle = startAngle + 87;
            const isActive = state === currentState;
            const cfg = STATE_CONFIG[state];
            const toRad = (deg: number) => (deg * Math.PI) / 180;

            const x1 = cx + r * Math.cos(toRad(startAngle + 2));
            const y1 = cy + r * Math.sin(toRad(startAngle + 2));
            const x2 = cx + r * Math.cos(toRad(endAngle));
            const y2 = cy + r * Math.sin(toRad(endAngle));

            // Label outside the ring at arc midpoint
            const midAngle = startAngle + 44;
            const lx = cx + (r + 22) * Math.cos(toRad(midAngle));
            const ly = cy + (r + 22) * Math.sin(toRad(midAngle));

            return (
              <g key={state}>
                <path
                  d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                  fill="none"
                  stroke={isActive ? cfg.color : `${cfg.color}38`}
                  strokeWidth={isActive ? 22 : 17}
                  strokeLinecap="round"
                />
                <text
                  x={lx} y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={7.5}
                  fontWeight={isActive ? "bold" : "normal"}
                  fill={isActive ? cfg.color : "var(--svg-muted, #475569)"}
                >
                  {cfg.abbr}
                </text>
              </g>
            );
          })}

          {/* Centre */}
          <circle cx={cx} cy={cy} r={34} fill="var(--svg-bg, #0a0a12)" />
          <text x={cx} y={cy - 9} textAnchor="middle" fontSize={18} fill={currentConfig.color}>
            {currentConfig.icon}
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8} fontWeight="bold" fill="var(--svg-muted, #94a3b8)">
            {currentConfig.abbr}
          </text>
        </svg>

        {/* Right panel */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">

          {/* Probabilities */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">State Probabilities</div>
            {STATES.map((state) => {
              const prob = ((cycle.probabilities?.[state] ?? 0) as number);
              const cfg = STATE_CONFIG[state];
              const isActive = state === currentState;
              return (
                <div key={state} className="flex items-center gap-2 mb-1">
                  <div
                    className="text-xs w-[76px] flex-shrink-0"
                    style={{ color: isActive ? cfg.color : "#64748b" }}
                  >
                    {cfg.phase}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${prob * 100}%`, backgroundColor: cfg.color }}
                    />
                  </div>
                  <div
                    className="text-xs font-mono w-9 text-right tabular-nums flex-shrink-0"
                    style={{ color: isActive ? cfg.color : "#64748b" }}
                  >
                    {(prob * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current phase description */}
          <div
            className="text-xs italic leading-relaxed px-2 py-1.5 rounded"
            style={{
              color: currentConfig.color,
              backgroundColor: `${currentConfig.color}11`,
              borderLeft: `2px solid ${currentConfig.color}60`,
            }}
          >
            <span className="font-semibold not-italic">{currentConfig.signal}: </span>
            {currentConfig.desc}
          </div>

          {/* Macro indicators */}
          {cycle.indicator_values && (
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(cycle.indicator_values as Record<string, number>)
                .slice(0, 4)
                .map(([key, val]) => (
                  <div key={key} className="bg-muted/50 rounded p-1.5">
                    <div className="text-[10px] text-muted-foreground leading-tight truncate">
                      {getIndicatorLabel(key)}
                    </div>
                    <div className="font-mono text-xs font-semibold">
                      {typeof val === "number" ? val.toFixed(2) : String(val)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
