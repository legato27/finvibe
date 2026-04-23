"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import {
  DollarSign, Shield, RefreshCw, Wrench, ChevronDown, ChevronUp,
  AlertTriangle, Loader2, RotateCcw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

type Tab = "income" | "wheel" | "hedge" | "repair";

interface Position { shares: number; avgCost: number }

interface OptionRec {
  key: string;
  label: string;
  strike: number;
  premium: number;
  expiry: string;
  dte: number;
  breakeven: number;
  maxReturn: number;
  annualized: number;
  fallbackConfidence: number;
  baseReasoning: string;
  entryCriteria: string;
  exitCriteria: string;
}

// ── Helpers ──────────────────────────────────────────────────

function nextFriday(daysOut: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  const dow = d.getDay();
  d.setDate(d.getDate() + ((5 - dow + 7) % 7 || 7));
  return d.toISOString().split("T")[0];
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// ── Strategy builders ────────────────────────────────────────

function buildIncome(ticker: string, price: number, iv: number, verdict: string, position?: Position): OptionRec[] {
  const pos = position ? `Your ${position.shares} shares ` : "";
  const recs: OptionRec[] = [];
  const otm30 = verdict === "buy" ? 0.07 : verdict === "hold" ? 0.05 : 0.03;
  const otm45 = otm30 + 0.02;

  [{ dte: 30, otm: otm30 }, { dte: 45, otm: otm45 }].forEach(({ dte, otm }) => {
    const strike = round2(price * (1 + otm));
    const premium = round2(price * iv * Math.sqrt(dte / 365) * 0.35);
    const costBasis = position?.avgCost || price;
    recs.push({
      key: `covered_call_${dte}`,
      label: `Covered Call ${dte} DTE`,
      strike, premium,
      expiry: nextFriday(dte), dte,
      breakeven: round2(costBasis - premium),
      maxReturn: round2(((premium * 100 + (strike - price) * 100) / (price * 100)) * 100),
      annualized: round2((premium / price) * (365 / dte) * 100),
      fallbackConfidence: verdict === "hold" ? 75 : 60,
      baseReasoning: `${pos}Sell the $${strike.toFixed(2)} call to collect $${premium.toFixed(2)}/share ($${(premium * 100).toFixed(0)} per contract). ${position ? `Reduces your avg cost to $${(costBasis - premium).toFixed(2)}.` : ""}`,
      entryCriteria: `Enter on green days or IV spikes above ${(iv * 100).toFixed(0)}%.`,
      exitCriteria: `Close at 50% profit ($${(premium * 0.5).toFixed(2)}). Roll up-and-out if stock rallies past $${strike.toFixed(2)}.`,
    });
  });
  return recs;
}

function buildWheel(ticker: string, price: number, iv: number, verdict: string, position?: Position): OptionRec[] {
  const recs: OptionRec[] = [];
  const otm30 = verdict === "buy" ? 0.05 : verdict === "hold" ? 0.08 : 0.12;
  const otm45 = otm30 + 0.03;

  [{ dte: 30, otm: otm30 }, { dte: 45, otm: otm45 }].forEach(({ dte, otm }) => {
    const strike = round2(price * (1 - otm));
    const premium = round2(price * iv * Math.sqrt(dte / 365) * 0.40 * (1 - otm));
    const capital = strike * 100;
    recs.push({
      key: `wheel_csp_${dte}`,
      label: `Wheel: CSP ${dte} DTE`,
      strike, premium,
      expiry: nextFriday(dte), dte,
      breakeven: round2(strike - premium),
      maxReturn: round2((premium * 100 / capital) * 100),
      annualized: round2((premium * 100 / capital) * (365 / dte) * 100),
      fallbackConfidence: verdict === "buy" ? 70 : 55,
      baseReasoning: `${position ? "Wheel phase 1: " : ""}Sell a put at $${strike.toFixed(2)} (${(otm * 100).toFixed(0)}% OTM). Collect $${premium.toFixed(2)}/share. If assigned, own shares at $${(strike - premium).toFixed(2)} effective cost then sell covered calls.`,
      entryCriteria: `Sell on pullbacks. Requires $${capital.toLocaleString()} capital per contract. Target IV rank > 30%.`,
      exitCriteria: `Buy back at 50% profit. Roll down-and-out if stock drops sharply. Transition to covered calls if assigned.`,
    });
  });
  return recs;
}

function buildHedge(ticker: string, price: number, iv: number, position?: Position): OptionRec[] {
  const shares = position?.shares || 100;
  const posVal = (price * shares).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const putStrike = round2(price * 0.95);
  const putPrem = round2(price * iv * Math.sqrt(60 / 365) * 0.45 * 1.05);

  const collarCall = round2(price * 1.07);
  const collarPut = round2(price * 0.95);
  const callPrem = round2(price * iv * Math.sqrt(60 / 365) * 0.35);
  const putCost = round2(price * iv * Math.sqrt(60 / 365) * 0.40);
  const netCost = round2(putCost - callPrem);

  return [
    {
      key: "protective_put",
      label: "Protective Put (60 DTE)",
      strike: putStrike, premium: putPrem,
      expiry: nextFriday(60), dte: 60,
      breakeven: round2(price + putPrem),
      maxReturn: round2((putPrem / price) * 100),
      annualized: 0,
      fallbackConfidence: 78,
      baseReasoning: `Buy a put at $${putStrike.toFixed(2)} to insure your $${posVal} position. Max loss capped at 5% + $${putPrem.toFixed(2)}/share cost. Ideal before earnings or macro uncertainty.`,
      entryCriteria: `Buy when IV is moderate (not elevated). Best when you can't actively manage the position.`,
      exitCriteria: `Sell put if stock rises significantly. Exercise or sell put if stock drops below $${putStrike.toFixed(2)}.`,
    },
    {
      key: "collar",
      label: "Collar (60 DTE)",
      strike: collarPut, premium: netCost,
      expiry: nextFriday(60), dte: 60,
      breakeven: round2(price + Math.max(0, netCost)),
      maxReturn: round2(((collarCall - price - Math.max(0, netCost)) / price) * 100),
      annualized: 0,
      fallbackConfidence: 70,
      baseReasoning: `Sell call at $${collarCall.toFixed(2)} (+$${callPrem.toFixed(2)}) and buy put at $${collarPut.toFixed(2)} (-$${putCost.toFixed(2)}). Net cost: $${netCost.toFixed(2)}/share. Caps upside at $${collarCall.toFixed(2)}, floors downside at $${collarPut.toFixed(2)}.`,
      entryCriteria: `Use to hold a position through uncertainty. Ideal when upside is already captured.`,
      exitCriteria: `Unwind both legs if thesis changes. Let call expire if stock stays flat.`,
    },
  ];
}

function buildRepair(ticker: string, price: number, iv: number, costBasis: number, shares: number): OptionRec[] {
  if (price >= costBasis) return [];
  const loss = costBasis - price;
  const repairTarget = round2((price + costBasis) / 2);
  const atmPrem = round2(price * iv * Math.sqrt(60 / 365) * 0.50);
  const otmPrem = round2(price * iv * Math.sqrt(60 / 365) * 0.30);
  const netDebit = round2(atmPrem - 2 * otmPrem);
  const monthlyPrem = round2(price * iv * Math.sqrt(30 / 365) * 0.40);
  const monthsToRecover = round2(loss / monthlyPrem);

  return [
    {
      key: "stock_repair",
      label: "Stock Repair (60 DTE)",
      strike: repairTarget, premium: netDebit,
      expiry: nextFriday(60), dte: 60,
      breakeven: round2(repairTarget + Math.max(0, netDebit)),
      maxReturn: round2(((repairTarget - price - Math.max(0, netDebit)) / costBasis) * 100),
      annualized: 0,
      fallbackConfidence: 65,
      baseReasoning: `Buy 1× ATM call at $${price.toFixed(2)}, sell 2× calls at $${repairTarget.toFixed(2)}. Near-zero net cost. If ${ticker} reaches $${repairTarget.toFixed(2)}, your $${loss.toFixed(2)}/share loss is halved without adding capital.`,
      entryCriteria: `Enter after stock stabilises post-drop. Works best on 100-share increments.`,
      exitCriteria: `Close spread when ${ticker} nears $${repairTarget.toFixed(2)} or at 21 DTE.`,
    },
    {
      key: "monthly_call_writing",
      label: "Monthly Call Writing",
      strike: round2(price * 1.03), premium: monthlyPrem,
      expiry: nextFriday(30), dte: 30,
      breakeven: round2(costBasis - monthlyPrem),
      maxReturn: round2((monthlyPrem / costBasis) * 100),
      annualized: round2((monthlyPrem / costBasis) * (365 / 30) * 100),
      fallbackConfidence: 72,
      baseReasoning: `Sell a 3% OTM call monthly at ~$${monthlyPrem.toFixed(2)}/share. At this rate, cost basis recovers to breakeven in ~${monthsToRecover} months. Each cycle reduces your avg cost from $${costBasis.toFixed(2)} by $${monthlyPrem.toFixed(2)}.`,
      entryCriteria: `Sell on any bounce or green day. Roll up-and-out if stock rallies past strike.`,
      exitCriteria: `Roll to next month at 21 DTE. Continue until cost basis equals current price.`,
    },
  ];
}

// ── Confidence Ring ──────────────────────────────────────────

function ConfidenceRing({ value, loading }: { value: number; loading?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  const stroke = pct >= 70 ? "#4ade80" : pct >= 50 ? "#facc15" : "#f87171";
  const r = 14, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  if (loading) return <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/40" />;

  return (
    <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="36" height="36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={stroke} strokeWidth="2"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className={`text-[9px] font-bold ${color}`}>{pct}</span>
    </div>
  );
}

// ── Strategy Card ────────────────────────────────────────────

function StrategyCard({
  rec, llmData, llmLoading, defaultOpen = false,
}: {
  rec: OptionRec;
  llmData?: { confidence: number; reasoning: string };
  llmLoading: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const confidence = llmData?.confidence ?? rec.fallbackConfidence;
  const reasoning = llmData?.reasoning || rec.baseReasoning;

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold truncate">{rec.label}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            ${rec.strike.toFixed(2)} · {rec.dte}d
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-green-400 hidden sm:inline">${rec.premium.toFixed(2)}/sh</span>
          {rec.annualized > 0 && (
            <span className="text-xs font-mono text-primary hidden md:inline">{rec.annualized.toFixed(0)}% ann.</span>
          )}
          <ConfidenceRing value={confidence} loading={llmLoading && !llmData} />
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border/20 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Strike", `$${rec.strike.toFixed(2)}`],
              ["Premium", `$${rec.premium.toFixed(2)}/sh`],
              ["Expiry", rec.expiry],
              ["Breakeven", `$${rec.breakeven.toFixed(2)}`],
              rec.maxReturn > 0 ? ["Max Return", `${rec.maxReturn.toFixed(1)}%`] : null,
              rec.annualized > 0 ? ["Annualised", `${rec.annualized.toFixed(0)}%`] : null,
            ].filter(Boolean).map((pair) => {
              const [label, val] = pair as [string, string];
              return (
                <div key={label}>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
                  <div className="text-sm font-mono font-semibold">{val}</div>
                </div>
              );
            })}
          </div>

          {/* LLM / base reasoning */}
          <div className={`rounded-lg p-3 text-xs leading-relaxed ${llmData ? "bg-primary/5 border border-primary/20" : "bg-accent/30"}`}>
            {llmLoading && !llmData
              ? <span className="text-muted-foreground/60 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> AI scoring…</span>
              : <span className="text-muted-foreground">{reasoning}</span>
            }
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
              <div className="text-[10px] text-green-400 uppercase tracking-wider font-semibold mb-1">Entry</div>
              <p className="text-xs text-muted-foreground">{rec.entryCriteria}</p>
            </div>
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
              <div className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold mb-1">Exit</div>
              <p className="text-xs text-muted-foreground">{rec.exitCriteria}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Wheel Cycle Diagram ──────────────────────────────────────

function WheelCycle({ price, position }: { price: number; position?: Position }) {
  const phase = position ? "covered_call" : "csp";
  return (
    <div className="bg-accent/20 border border-border/30 rounded-lg p-3 mb-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">The Wheel Cycle</div>
      <div className="flex items-center gap-1 text-xs flex-wrap">
        {[
          { label: "① Sell CSP", active: phase === "csp" },
          { label: "→ Assigned?", arrow: true },
          { label: "② Sell CC", active: phase === "covered_call" },
          { label: "→ Called away?", arrow: true },
          { label: "① Restart", },
        ].map((s, i) => (
          s.arrow
            ? <span key={i} className="text-muted-foreground/40">→</span>
            : <span key={i} className={`px-2 py-0.5 rounded-full ${s.active ? "bg-primary/20 text-primary font-semibold" : "bg-muted text-muted-foreground"}`}>
                {s.label}
              </span>
        ))}
      </div>
      {position && (
        <p className="text-[10px] text-muted-foreground mt-2">
          You own shares — you're in the CC phase. Sell covered calls to collect income until called away, then restart CSP.
        </p>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

interface StockOptionsStrategyProps {
  ticker: string;
  currentPrice: number;
  stockInfo: any;
  thoughts: any;
  position?: Position;
}

export function StockOptionsStrategy({
  ticker, currentPrice, stockInfo, thoughts, position,
}: StockOptionsStrategyProps) {
  const isUnderwater = position ? currentPrice < position.avgCost : false;
  const [tab, setTab] = useState<Tab>("income");

  const verdict = thoughts?.verdict || "hold";
  const conviction = thoughts?.conviction || "medium";
  const beta = stockInfo?.beta || 1.0;
  const high52 = stockInfo?.fifty_two_week_high || currentPrice * 1.25;
  const low52 = stockInfo?.fifty_two_week_low || currentPrice * 0.75;
  const pe = stockInfo?.pe_ratio || stockInfo?.forward_pe || null;
  const iv = Math.max(0.15, Math.min(0.80, ((high52 - low52) / currentPrice) * beta * 0.7));
  const ivPct = Math.round(iv * 100);

  // ── LLM inference ──────────────────────────────────────────
  const inferenceBody = {
    current_price: currentPrice,
    verdict, conviction,
    iv_pct: ivPct,
    beta,
    high_52w: high52,
    low_52w: low52,
    pe: pe || undefined,
    shares: position?.shares,
    cost_basis: position?.avgCost,
  };

  const { data: llmData, isLoading: llmLoading } = useQuery({
    queryKey: ["options-inference", ticker, verdict, conviction, position?.avgCost],
    queryFn: () => stocksApi.optionsInference(ticker, inferenceBody),
    staleTime: 6 * 60 * 60 * 1000, // 6hr — matches backend cache
    retry: 1,
    enabled: currentPrice > 0,
  });

  const strategies = llmData?.strategies || {};

  // ── Build recs ─────────────────────────────────────────────
  const income = buildIncome(ticker, currentPrice, iv, verdict, position);
  const wheel = buildWheel(ticker, currentPrice, iv, verdict, position);
  const hedge = buildHedge(ticker, currentPrice, iv, position);
  const repair = position && isUnderwater
    ? buildRepair(ticker, currentPrice, iv, position.avgCost, position.shares)
    : [];

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "income", label: "Income", icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: "wheel", label: "Wheel", icon: <RotateCcw className="w-3.5 h-3.5" /> },
    { id: "hedge", label: "Hedge", icon: <Shield className="w-3.5 h-3.5" /> },
    ...(position ? [{ id: "repair" as Tab, label: "Repair", icon: <Wrench className="w-3.5 h-3.5" />, badge: isUnderwater ? "!" : undefined }] : []),
  ];

  const activeRecs = tab === "income" ? income : tab === "wheel" ? wheel : tab === "hedge" ? hedge : repair;

  const contextBanner: Record<Tab, { style: string; text: string }> = {
    income: { style: "bg-primary/5 border-primary/20", text: position ? `Sell premium against your ${position.shares} shares to generate recurring income and lower your avg cost of $${position.avgCost.toFixed(2)}.` : "Sell premium against shares you own (or would own via assignment) to generate income." },
    wheel: { style: "bg-purple-500/5 border-purple-500/20", text: "Repeatedly sell cash-secured puts → get assigned → sell covered calls → called away → repeat. Compound income over time." },
    hedge: { style: "bg-blue-500/5 border-blue-500/20", text: position ? `Protect your ${position.shares}× ${ticker} position ($${(currentPrice * position.shares).toLocaleString(undefined, { maximumFractionDigits: 0 })} value) against a significant drawdown.` : "Use options to hedge an existing or planned stock position against downside risk." },
    repair: { style: "bg-orange-500/5 border-orange-500/20", text: position && isUnderwater ? `Down $${((position.avgCost - currentPrice) * position.shares).toLocaleString(undefined, { maximumFractionDigits: 0 })} total. Strategies to recover breakeven without adding capital.` : "Position is profitable — repair strategies only apply to underwater holdings." },
  };

  const banner = contextBanner[tab];

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">Options Strategies</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 space-x-2">
            <span>IV est. {ivPct}%</span>
            <span>·</span>
            <span>{verdict.toUpperCase()} · {conviction}</span>
            {position && (
              <>
                <span>·</span>
                <span className={isUnderwater ? "text-orange-400" : "text-green-400"}>
                  {isUnderwater
                    ? `Underwater $${(position.avgCost - currentPrice).toFixed(2)}/sh`
                    : `+$${(currentPrice - position.avgCost).toFixed(2)}/sh`}
                </span>
              </>
            )}
          </div>
        </div>
        {llmData?.market_context && (
          <div className="text-[10px] text-muted-foreground/70 max-w-[240px] text-right hidden sm:block italic">
            {llmData.market_context}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors relative ${
              tab === t.id ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
            {t.badge && (
              <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-orange-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">!</span>
            )}
          </button>
        ))}
      </div>

      {/* Context banner */}
      <div className={`text-xs text-muted-foreground border rounded-lg px-3 py-2 ${banner.style}`}>
        {tab === "repair" && isUnderwater && <AlertTriangle className="w-3 h-3 inline mr-1 text-orange-400" />}
        {banner.text}
      </div>

      {tab === "wheel" && <WheelCycle price={currentPrice} position={position} />}

      {/* Strategy cards */}
      <div className="space-y-2">
        {activeRecs.length > 0
          ? activeRecs.map((rec, i) => (
              <StrategyCard
                key={rec.key}
                rec={rec}
                llmData={strategies[rec.key]}
                llmLoading={llmLoading}
                defaultOpen={i === 0}
              />
            ))
          : (
            <div className="text-center text-sm text-muted-foreground py-6">
              {tab === "repair" ? "Position is not underwater — no repair needed." : "No strategies available."}
            </div>
          )
        }
      </div>

      <p className="text-[10px] text-muted-foreground/50">
        Estimates only — not financial advice. Verify strikes and premiums with your broker.
        {llmLoading && <span className="ml-1 text-primary/60">AI scoring in progress…</span>}
      </p>
    </div>
  );
}
