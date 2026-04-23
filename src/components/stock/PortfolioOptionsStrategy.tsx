"use client";
import { useState } from "react";
import { Shield, DollarSign, Wrench, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

type Tab = "income" | "hedge" | "repair";

interface OptionRec {
  strategy: string;
  strike: number;
  premium: number;
  expiry: string;
  dte: number;
  breakeven: number;
  maxReturn: number;
  annualized: number;
  confidence: number;
  reasoning: string;
  entryCriteria: string;
  exitCriteria: string;
}

function nextFriday(daysOut: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  const dow = d.getDay();
  d.setDate(d.getDate() + ((5 - dow + 7) % 7 || 7));
  return d.toISOString().split("T")[0];
}

function buildIncome(ticker: string, price: number, costBasis: number, shares: number, iv: number, verdict: string): OptionRec[] {
  const recs: OptionRec[] = [];

  // Covered Call — 30 DTE
  const ccOtm = verdict === "buy" ? 0.08 : verdict === "hold" ? 0.05 : 0.03;
  const ccStrike = Math.round(price * (1 + ccOtm) * 100) / 100;
  const ccPremium = Math.round(price * iv * Math.sqrt(30 / 365) * 0.35 * 100) / 100;
  recs.push({
    strategy: "Covered Call (30 DTE)",
    strike: ccStrike,
    premium: ccPremium,
    expiry: nextFriday(30),
    dte: 30,
    breakeven: price - ccPremium,
    maxReturn: ((ccPremium * 100 + (ccStrike - price) * 100) / (price * 100)) * 100,
    annualized: (ccPremium / price) * (365 / 30) * 100,
    confidence: verdict === "hold" ? 0.75 : 0.60,
    reasoning: `You own ${shares} shares at avg $${costBasis.toFixed(2)}. Selling a call at $${ccStrike.toFixed(2)} collects $${ccPremium.toFixed(2)}/share ($${(ccPremium * 100).toFixed(0)} total). Your cost basis drops to $${(costBasis - ccPremium).toFixed(2)}/share.`,
    entryCriteria: `Sell when ${ticker} trades near $${price.toFixed(2)}. Best on green days or IV spikes.`,
    exitCriteria: `Buy back at 50% profit ($${(ccPremium * 0.5).toFixed(2)}). Roll up-and-out if stock rallies above $${ccStrike.toFixed(2)}.`,
  });

  // Covered Call — 45 DTE sweet spot
  const cc45Strike = Math.round(price * (1 + ccOtm + 0.02) * 100) / 100;
  const cc45Premium = Math.round(price * iv * Math.sqrt(45 / 365) * 0.36 * 100) / 100;
  recs.push({
    strategy: "Covered Call (45 DTE)",
    strike: cc45Strike,
    premium: cc45Premium,
    expiry: nextFriday(45),
    dte: 45,
    breakeven: price - cc45Premium,
    maxReturn: ((cc45Premium * 100 + (cc45Strike - price) * 100) / (price * 100)) * 100,
    annualized: (cc45Premium / price) * (365 / 45) * 100,
    confidence: 0.78,
    reasoning: `45 DTE is the optimal theta decay window. Strike at $${cc45Strike.toFixed(2)} gives ${((ccOtm + 0.02) * 100).toFixed(0)}% upside room. Monthly premium income of $${(cc45Premium * 100).toFixed(0)} reduces your effective cost basis.`,
    entryCriteria: `Target IV rank > 30%. Enter when ${ticker} is near resistance or on a green day.`,
    exitCriteria: `Close at 50% profit or 21 DTE. Roll to next month at 21 DTE if still OTM and wanting income.`,
  });

  return recs;
}

function buildHedge(ticker: string, price: number, costBasis: number, shares: number, iv: number): OptionRec[] {
  const recs: OptionRec[] = [];
  const positionValue = price * shares;

  // Protective Put — 5% OTM, 60 DTE
  const putOtm = 0.05;
  const putStrike = Math.round(price * (1 - putOtm) * 100) / 100;
  const putPremium = Math.round(price * iv * Math.sqrt(60 / 365) * 0.45 * (1 + putOtm) * 100) / 100;
  const putBreakeven = price + putPremium; // position must rise to cover put cost
  recs.push({
    strategy: "Protective Put (60 DTE)",
    strike: putStrike,
    premium: putPremium,
    expiry: nextFriday(60),
    dte: 60,
    breakeven: putBreakeven,
    maxReturn: (putPremium / price) * 100,
    annualized: (putPremium / price) * (365 / 60) * 100,
    confidence: 0.80,
    reasoning: `Buying a put at $${putStrike.toFixed(2)} insures your ${shares} shares against a drop below $${putStrike.toFixed(2)}. Cost: $${(putPremium * 100).toFixed(0)} protects $${positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} position. Max loss is now capped at ${putOtm * 100}% + premium.`,
    entryCriteria: `Buy before earnings, market uncertainty, or when you can't watch the position. Best when IV is moderate.`,
    exitCriteria: `Sell put if ${ticker} rises significantly (put loses value). Exercise or sell if ${ticker} drops below $${putStrike.toFixed(2)}.`,
  });

  // Collar — sell call + buy put, near zero net cost
  const collarCallOtm = 0.07;
  const collarPutOtm = 0.05;
  const collarCall = Math.round(price * (1 + collarCallOtm) * 100) / 100;
  const collarPut = Math.round(price * (1 - collarPutOtm) * 100) / 100;
  const collarCallPrem = Math.round(price * iv * Math.sqrt(60 / 365) * 0.35 * 100) / 100;
  const collarPutPrem = Math.round(price * iv * Math.sqrt(60 / 365) * 0.40 * 100) / 100;
  const netCost = collarPutPrem - collarCallPrem;
  recs.push({
    strategy: "Collar (60 DTE)",
    strike: collarPut,
    premium: netCost,
    expiry: nextFriday(60),
    dte: 60,
    breakeven: price + Math.max(0, netCost),
    maxReturn: ((collarCall - price - Math.max(0, netCost)) / price) * 100,
    annualized: 0,
    confidence: 0.72,
    reasoning: `Sell call at $${collarCall.toFixed(2)} (+$${collarCallPrem.toFixed(2)}) and buy put at $${collarPut.toFixed(2)} (-$${collarPutPrem.toFixed(2)}). Net cost: $${netCost.toFixed(2)}/share. Caps upside at $${collarCall.toFixed(2)} but floors downside at $${collarPut.toFixed(2)}.`,
    entryCriteria: `Use when you want to hold shares but protect against a correction. Ideal before earnings or uncertain macro.`,
    exitCriteria: `Unwind both legs if thesis changes. Let call expire if stock stays flat; exercise put if stock drops.`,
  });

  return recs;
}

function buildRepair(ticker: string, price: number, costBasis: number, shares: number, iv: number): OptionRec[] {
  if (price >= costBasis) return []; // only relevant when underwater

  const recs: OptionRec[] = [];
  const lossPerShare = costBasis - price;

  // Stock Repair: buy 1 ATM call + sell 2 OTM calls at halfway point
  const atm = Math.round(price * 100) / 100;
  const repairTarget = Math.round(((price + costBasis) / 2) * 100) / 100;
  const atmPremium = Math.round(price * iv * Math.sqrt(60 / 365) * 0.50 * 100) / 100;
  const otmPremium = Math.round(price * iv * Math.sqrt(60 / 365) * 0.30 * 100) / 100;
  const netDebit = atmPremium - 2 * otmPremium;

  recs.push({
    strategy: "Stock Repair Strategy (60 DTE)",
    strike: repairTarget,
    premium: netDebit,
    expiry: nextFriday(60),
    dte: 60,
    breakeven: repairTarget,
    maxReturn: ((repairTarget - price - netDebit) / costBasis) * 100,
    annualized: 0,
    confidence: 0.65,
    reasoning: `You're underwater by $${lossPerShare.toFixed(2)}/share. Buy 1× ATM call at $${atm.toFixed(2)}, sell 2× calls at $${repairTarget.toFixed(2)}. This doubles your "shares" from $${price.toFixed(2)} to $${repairTarget.toFixed(2)} at near-zero cost. If ${ticker} reaches $${repairTarget.toFixed(2)}, breakeven recovery is achieved without adding capital.`,
    entryCriteria: `Best when stock has stabilised after a drop. Enter when IV is moderate. Ideal holding size: per 100 shares owned.`,
    exitCriteria: `Close the spread when ${ticker} approaches $${repairTarget.toFixed(2)} or at 21 DTE. Roll if stock is close but needs more time.`,
  });

  // Aggressive repair: sell ATM covered call to reduce cost basis each month
  const aggressivePremium = Math.round(price * iv * Math.sqrt(30 / 365) * 0.40 * 100) / 100;
  const monthsToRecover = lossPerShare / aggressivePremium;
  recs.push({
    strategy: "Monthly Call Writing (Cost Basis Reduction)",
    strike: Math.round(price * 1.03 * 100) / 100,
    premium: aggressivePremium,
    expiry: nextFriday(30),
    dte: 30,
    breakeven: costBasis - aggressivePremium,
    maxReturn: (aggressivePremium / costBasis) * 100,
    annualized: (aggressivePremium / costBasis) * (365 / 30) * 100,
    confidence: 0.70,
    reasoning: `Sell a 3% OTM covered call each month collecting ~$${aggressivePremium.toFixed(2)}/share. At this rate, your cost basis of $${costBasis.toFixed(2)} drops to breakeven in ~${monthsToRecover.toFixed(1)} months without additional capital. Current basis reduces by $${aggressivePremium.toFixed(2)} each cycle.`,
    entryCriteria: `Sell on any bounce or green day. Target 3–5% OTM to allow some recovery while collecting premium.`,
    exitCriteria: `Roll up-and-out if stock rallies past strike. Keep rolling until cost basis reaches current price.`,
  });

  return recs;
}

function RecCard({ rec, defaultOpen = false }: { rec: OptionRec; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const confidencePct = Math.round(rec.confidence * 100);

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{rec.strategy}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            ${rec.strike.toFixed(2)} strike · {rec.dte}d
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-mono text-green-400">${rec.premium.toFixed(2)}/sh</span>
          {rec.annualized > 0 && (
            <span className="text-xs font-mono text-primary hidden sm:inline">
              {rec.annualized.toFixed(0)}% ann.
            </span>
          )}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border border-border/40"
            style={{ background: `conic-gradient(rgb(99 102 241) ${confidencePct}%, transparent 0)` }}
          >
            {confidencePct}
          </div>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border/20 space-y-3">
          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Strike</div>
              <div className="text-sm font-mono font-semibold">${rec.strike.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Premium</div>
              <div className="text-sm font-mono font-semibold text-green-400">${rec.premium.toFixed(2)}/sh</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Expiry</div>
              <div className="text-sm font-mono">{rec.expiry}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Breakeven</div>
              <div className="text-sm font-mono">${rec.breakeven.toFixed(2)}</div>
            </div>
            {rec.maxReturn > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Max Return</div>
                <div className="text-sm font-mono text-primary">{rec.maxReturn.toFixed(1)}%</div>
              </div>
            )}
            {rec.annualized > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Annualised</div>
                <div className="text-sm font-mono text-primary">{rec.annualized.toFixed(0)}%</div>
              </div>
            )}
          </div>
          {/* Reasoning */}
          <div className="bg-accent/30 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
            {rec.reasoning}
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

interface PortfolioOptionsStrategyProps {
  ticker: string;
  currentPrice: number;
  costBasis: number;
  shares: number;
  stockInfo: any;
  thoughts: any;
}

export function PortfolioOptionsStrategy({
  ticker, currentPrice, costBasis, shares, stockInfo, thoughts,
}: PortfolioOptionsStrategyProps) {
  const [tab, setTab] = useState<Tab>("income");

  const verdict = thoughts?.verdict || "hold";
  const beta = stockInfo?.beta || 1.0;
  const high52 = stockInfo?.fifty_two_week_high || currentPrice * 1.2;
  const low52 = stockInfo?.fifty_two_week_low || currentPrice * 0.8;
  const range52 = high52 - low52;
  const iv = Math.max(0.15, Math.min(0.80, (range52 / currentPrice) * beta * 0.7));
  const isUnderwater = currentPrice < costBasis;

  const income = buildIncome(ticker, currentPrice, costBasis, shares, iv, verdict);
  const hedge = buildHedge(ticker, currentPrice, costBasis, shares, iv);
  const repair = buildRepair(ticker, currentPrice, costBasis, shares, iv);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "income", label: "Income", icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: "hedge", label: "Hedge", icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "repair", label: "Repair", icon: <Wrench className="w-3.5 h-3.5" />, badge: isUnderwater ? "!" : undefined },
  ];

  const activeRecs = tab === "income" ? income : tab === "hedge" ? hedge : repair;

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Options Strategies</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            IV est. {(iv * 100).toFixed(0)}% · {verdict.toUpperCase()} verdict ·{" "}
            {isUnderwater
              ? <span className="text-orange-400">Underwater by ${(costBasis - currentPrice).toFixed(2)}/sh</span>
              : <span className="text-green-400">+${(currentPrice - costBasis).toFixed(2)}/sh gain</span>
            }
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors relative ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
            {t.badge && (
              <span className="absolute top-0.5 right-1 w-3.5 h-3.5 bg-orange-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Context for each tab */}
      {tab === "income" && (
        <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
          Sell premium against your {shares} shares to generate recurring income and lower your cost basis.
        </div>
      )}
      {tab === "hedge" && (
        <div className="text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2">
          Protect your {shares}× {ticker} position (${(currentPrice * shares).toLocaleString(undefined, { maximumFractionDigits: 0 })} value) against a significant drawdown.
        </div>
      )}
      {tab === "repair" && (
        isUnderwater ? (
          <div className="text-xs text-muted-foreground bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3 h-3 inline mr-1 text-orange-400" />
            Position is down ${((costBasis - currentPrice) * shares).toLocaleString(undefined, { maximumFractionDigits: 0 })} total. These strategies aim to recover breakeven without adding capital.
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
            Position is profitable — repair strategies only apply to underwater holdings.
          </div>
        )
      )}

      {/* Recommendations */}
      <div className="space-y-2">
        {activeRecs.length > 0
          ? activeRecs.map((r, i) => <RecCard key={i} rec={r} defaultOpen={i === 0} />)
          : (
            <div className="text-center text-sm text-muted-foreground py-6">
              {tab === "repair" ? "Position is not underwater — no repair needed." : "No recommendations available."}
            </div>
          )
        }
      </div>

      <p className="text-[10px] text-muted-foreground/50">
        Estimates only — not financial advice. Verify strikes and premiums with your broker before trading.
      </p>
    </div>
  );
}
