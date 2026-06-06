"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Scenario {
  intrinsic_value?: number;
  wacc?: number;
  g_stage1?: number;
  g_terminal?: number;
  margin_of_safety?: number | null;
}

interface DcfDetail {
  scenarios?: Record<string, Scenario>;
  sensitivity?: {
    wacc_axis?: number[];
    terminal_g_axis?: number[];
    grid?: (number | null)[][];
  };
  reverse_dcf?: { implied_stage1_growth?: number; note?: string } | null;
  current_price?: number;
}

const pct = (x?: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const usd = (x?: number | null) => (x == null ? "n/a" : `$${x.toFixed(2)}`);

const SCEN = [
  { key: "bear", label: "Bear", color: "text-red-400" },
  { key: "base", label: "Base", color: "text-foreground" },
  { key: "bull", label: "Bull", color: "text-emerald-400" },
];

export function DcfScenarios({ dcf }: { dcf: DcfDetail | null | undefined }) {
  const [showGrid, setShowGrid] = useState(false);
  if (!dcf || !dcf.scenarios) return null;
  const cp = dcf.current_price;

  // The simple 10-yr DCF systematically undervalues high-growth / high-beta
  // names (high WACC + median-FCF base). Flag it when even the bull case sits
  // far below price, or reverse-DCF couldn't bracket the current price.
  const bullIv = dcf.scenarios?.bull?.intrinsic_value;
  const dcfUnreliable =
    (cp != null && bullIv != null && bullIv < cp * 0.6) ||
    dcf.reverse_dcf?.implied_stage1_growth == null;

  return (
    <div className="card p-4 space-y-4">
      <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
        DCF Scenarios
      </div>

      {dcfUnreliable && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px] text-amber-200/90 leading-relaxed">
          ⚠ The simple 10-year DCF implies deep overvaluation here. This model
          systematically undervalues high-growth / high-beta companies (high WACC
          + a 5-year median FCF base). Treat these figures as a conservative floor
          and weight the valuation multiples and analyst view more heavily.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SCEN.map(({ key, label, color }) => {
          const s = dcf.scenarios?.[key];
          if (!s) return null;
          // Implied move to fair value, relative to price — far clearer than the
          // intrinsic-relative MoS when IV and price diverge sharply.
          const vsPrice =
            cp != null && cp > 0 && s.intrinsic_value != null ? (s.intrinsic_value - cp) / cp : null;
          return (
            <div key={key} className="bg-accent/30 border border-border/30 rounded-lg p-3 text-center">
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>{label}</div>
              <div className="text-lg font-mono mt-1">{usd(s.intrinsic_value)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {vsPrice == null ? "" : `${vsPrice >= 0 ? "+" : ""}${(vsPrice * 100).toFixed(0)}% vs price`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                WACC {pct(s.wacc)} · g₁ {pct(s.g_stage1)}
              </div>
            </div>
          );
        })}
      </div>

      {cp != null && (
        <div className="text-[11px] text-muted-foreground">
          Current price: <span className="font-mono">{usd(cp)}</span>
        </div>
      )}

      {dcf.reverse_dcf?.implied_stage1_growth != null && (
        <div className="bg-accent/20 border border-border/30 rounded-lg p-3 text-xs">
          <span className="text-muted-foreground">Reverse-DCF — the market is pricing in </span>
          <span className="font-mono text-foreground/90">{pct(dcf.reverse_dcf.implied_stage1_growth)}</span>
          <span className="text-muted-foreground"> stage-1 FCF growth at the current price.</span>
        </div>
      )}

      {dcf.sensitivity?.grid && (
        <div>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary"
          >
            {showGrid ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Sensitivity (WACC × terminal growth)
          </button>
          {showGrid && (
            <div className="overflow-x-auto mt-2">
              <table className="text-[10px] font-mono border-collapse">
                <thead>
                  <tr>
                    <th className="p-1 text-muted-foreground text-left">WACC＼g</th>
                    {dcf.sensitivity.terminal_g_axis?.map((g, gi) => (
                      <th key={gi} className="p-1 text-muted-foreground">{pct(g)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dcf.sensitivity.grid.map((row, i) => (
                    <tr key={i}>
                      <td className="p-1 text-muted-foreground">{pct(dcf.sensitivity?.wacc_axis?.[i])}</td>
                      {row.map((v, j) => {
                        const above = cp != null && v != null && v >= cp;
                        return (
                          <td
                            key={j}
                            className={`p-1 text-center ${
                              v == null ? "text-muted-foreground" : above ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {v == null ? "—" : `$${v.toFixed(0)}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[10px] text-muted-foreground mt-1">
                Green = intrinsic ≥ current price (undervalued); red = overvalued.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
