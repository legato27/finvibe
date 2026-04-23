"use client";

import { useEffect, useState } from "react";

const POLYEDGE_API = "https://polyedge-api.vibelife.sg";

interface Portfolio {
  bankroll_usd: number;
  open_positions_value: number;
  total_pnl: number;
  total_trades: number;
  open_positions_count: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  current_sharpe: number | null;
}

interface Position {
  id: string;
  market_title: string;
  side: string;
  entry_price: number;
  current_price: number | null;
  size_usd: number;
  shares: number;
  opened_at: string;
  strategy: string;
  resolution_at: string | null;
  slug: string | null;
  confidence: number | null;
  ev_estimate_pct: number | null;
  edge_source: string | null;
  reasoning: string | null;
  entry_reasoning: string | null;
}

interface Decision {
  id: string;
  decided_at: string;
  action: string;
  strategy: string;
  size_usd: number;
  confidence: number;
  ev_estimate_pct: number;
  reasoning: string;
  edge_source: string | null;
  status: string;
  risk_gate_rejection: string | null;
}

interface EngineState {
  status: string;
  last_scan_at: string | null;
  last_scan_markets: number;
  last_scan_decisions: number;
  trades_in_cycle: number | null;
  exposure_in_cycle: number | null;
  remaining_exposure: number | null;
  llm_backend?: string;
  llm_model?: string;
}

function formatLLM(backend?: string, model?: string): string {
  if (!model) return "LLM";
  if (backend === "local") {
    const m = model.toLowerCase();
    if (m.includes("gemma")) {
      const match = model.match(/gemma-?(\d+(?:\.\d+)?)[\w-]*?-?(\d+B(?:-A\d+B)?)/i);
      if (match) return `Gemma ${match[1]}-${match[2]} (local vLLM)`;
      return `${model.split("/").pop()} (local vLLM)`;
    }
    return `${model.split("/").pop()} (local vLLM)`;
  }
  if (model.includes("claude")) {
    if (model.includes("sonnet-4")) return "Claude Sonnet 4";
    if (model.includes("opus-4")) return "Claude Opus 4";
    if (model.includes("haiku-4")) return "Claude Haiku 4";
    return model;
  }
  return model;
}

function formatSGT(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

function expiresIn(dateStr: string | null) {
  if (!dateStr) return { text: "—", hours: Infinity };
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return { text: "Expired", hours: -1 };
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  let text = "";
  if (days > 0) text = `${days}d ${hours % 24}h`;
  else if (hours > 0) text = `${hours}h`;
  else text = `${Math.floor(diff / 60000)}m`;
  return { text, hours };
}

function getCategory(title: string): string {
  const t = title.toLowerCase();
  if (/bitcoin|btc|crypto|ethereum/.test(t)) return "Crypto";
  if (/trump|biden|congress|republican|democrat/.test(t)) return "US Politics";
  if (/prime minister|election|parliament|orban|magyar/.test(t)) return "World Politics";
  if (/iran|israel|military|war|conflict|ceasefire|missile|hormuz|kharg/.test(t)) return "Geopolitics";
  if (/oil|wti|crude/.test(t)) return "Commodities";
  if (/fed |rate cut|inflation|tariff|gdp/.test(t)) return "Economics";
  if (/nba|nfl|nhl|ufc|masters|league|vs\.|vs /.test(t)) return "Sports";
  if (/ai |openai|anthropic|tesla|apple/.test(t)) return "Tech";
  return "Other";
}

const stratColors: Record<string, string> = {
  logical_arb: "bg-blue-500/20 text-blue-400",
  base_rate: "bg-amber-500/20 text-amber-400",
  claude_edge: "bg-emerald-500/20 text-emerald-400",
  copy_trade: "bg-cyan-500/20 text-cyan-400",
  xplatform_arb: "bg-purple-500/20 text-purple-400",
};

const statusColors: Record<string, string> = {
  scanning: "bg-blue-500",
  deciding: "bg-amber-500",
  executing: "bg-emerald-500",
  idle: "bg-emerald-500",
  cycle_full: "bg-orange-500",
};

type SortKey = "market" | "side" | "entry" | "current" | "size" | "pnl" | "category" | "expires" | "strategy" | "confidence" | "opened";

export default function PolyEdgePage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("expires");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedPos, setExpandedPos] = useState<string | null>(null);
  const [expandedDec, setExpandedDec] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [p, pos, dec, eng] = await Promise.all([
          fetch(`${POLYEDGE_API}/api/portfolio`).then((r) => r.json()),
          fetch(`${POLYEDGE_API}/api/positions`).then((r) => r.json()),
          fetch(`${POLYEDGE_API}/api/decisions?limit=20`).then((r) => r.json()),
          fetch(`${POLYEDGE_API}/api/engine-status`).then((r) => r.json()).catch(() => null),
        ]);
        setPortfolio(p);
        setPositions(pos);
        setDecisions(dec);
        setEngine(eng);
        setError(false);
      } catch {
        setError(true);
      }
    }
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "size" || key === "pnl" ? "desc" : "asc"); }
  };

  const trades = decisions.filter((d) => d.action !== "SKIP");
  const totalEquity = portfolio ? portfolio.bankroll_usd + portfolio.open_positions_value : 0;
  const pnlPct = portfolio ? (portfolio.total_pnl / 10000 * 100) : 0;

  // Enrich positions
  const enriched = positions.map((p) => {
    const entry = Number(p.entry_price);
    const current = p.current_price ? Number(p.current_price) : null;
    const shares = Number(p.shares);
    let unrealized = 0;
    if (current !== null) {
      unrealized = p.side === "YES" ? (current - entry) * shares : (entry - current) * shares;
    }
    const expiry = expiresIn(p.resolution_at);
    const category = getCategory(p.market_title);
    return { ...p, unrealized, currentNum: current, expiry, category };
  });

  const sorted = [...enriched].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "market": return a.market_title.localeCompare(b.market_title) * dir;
      case "side": return a.side.localeCompare(b.side) * dir;
      case "entry": return (Number(a.entry_price) - Number(b.entry_price)) * dir;
      case "current": return ((a.currentNum ?? 0) - (b.currentNum ?? 0)) * dir;
      case "size": return (Number(a.size_usd) - Number(b.size_usd)) * dir;
      case "pnl": return (a.unrealized - b.unrealized) * dir;
      case "category": return a.category.localeCompare(b.category) * dir;
      case "expires": return (a.expiry.hours - b.expiry.hours) * dir;
      case "strategy": return a.strategy.localeCompare(b.strategy) * dir;
      case "confidence": return ((a.confidence ?? 0) - (b.confidence ?? 0)) * dir;
      case "opened": return (new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()) * dir;
      default: return 0;
    }
  });

  const totalDeployed = enriched.reduce((s, p) => s + Number(p.size_usd), 0);
  const totalUnrealized = enriched.reduce((s, p) => s + p.unrealized, 0);

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th className="px-3 py-2 cursor-pointer hover:text-foreground select-none" onClick={() => onSort(k)}>
        <span className="flex items-center gap-1">{label}{active && <span className="text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}</span>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Engine Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            PolyEdge
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-500">LIVE</span>
          </h1>
          <p className="text-xs text-muted-foreground">Autonomous Polymarket trader powered by {formatLLM(engine?.llm_backend, engine?.llm_model)}</p>
        </div>
        <div className="flex items-center gap-3">
          {engine && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={`h-2 w-2 rounded-full ${statusColors[engine.status] || "bg-gray-500"} ${engine.status === "scanning" || engine.status === "deciding" ? "animate-pulse" : ""}`} />
              <span className="capitalize">{engine.status === "cycle_full" ? "Cycle full" : engine.status}</span>
              {engine.exposure_in_cycle != null && (
                <span className={engine.remaining_exposure != null && engine.remaining_exposure <= 200 ? "text-amber-400" : ""}>
                  ${engine.exposure_in_cycle}/$2k
                </span>
              )}
            </div>
          )}
          <a href="https://polyedge.vibelife.sg" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
            Full Dashboard &rarr;
          </a>
        </div>
      </div>

      {error && (
        <div className="card border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">Cannot connect to PolyEdge API</div>
      )}

      {/* Stats */}
      {portfolio && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Bankroll", value: `$${portfolio.bankroll_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, sub: `$${portfolio.open_positions_value.toFixed(0)} deployed` },
            { label: "Total Equity", value: `$${totalEquity.toFixed(2)}`, sub: "cash + positions" },
            { label: "P&L", value: `${portfolio.total_pnl >= 0 ? "+" : ""}$${portfolio.total_pnl.toFixed(2)}`, sub: `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% of initial`, cls: portfolio.total_pnl >= 0 ? "text-green-500" : "text-red-500" },
            { label: "Win Rate", value: portfolio.win_rate != null ? `${(portfolio.win_rate * 100).toFixed(1)}%` : "N/A", sub: portfolio.wins != null ? `${portfolio.wins}W / ${portfolio.losses}L` : undefined },
            { label: "Trades", value: `${portfolio.total_trades}`, sub: `${portfolio.open_positions_count} open` },
            { label: "Sharpe", value: portfolio.current_sharpe != null ? `${portfolio.current_sharpe.toFixed(2)}` : "N/A", sub: "30d rolling" },
          ].map((s) => (
            <div key={s.label} className="card p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className={`text-lg font-semibold ${s.cls || "text-foreground"}`}>{s.value}</div>
              {s.sub && <div className="text-[10px] text-muted-foreground">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Open positions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Open Positions ({positions.length})</h2>
        {positions.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted-foreground">No open positions</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                  <SortTh label="Market" k="market" />
                  <SortTh label="Side" k="side" />
                  <SortTh label="Entry" k="entry" />
                  <SortTh label="Current" k="current" />
                  <SortTh label="Size" k="size" />
                  <SortTh label="P&L" k="pnl" />
                  <SortTh label="Category" k="category" />
                  <SortTh label="Expires" k="expires" />
                  <SortTh label="Strategy" k="strategy" />
                  <SortTh label="Conf" k="confidence" />
                  <SortTh label="Opened" k="opened" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const pnlClass = p.unrealized > 0.01 ? "text-green-500" : p.unrealized < -0.01 ? "text-red-500" : "";
                  const expiryClass = p.expiry.hours < 2 ? "text-red-500" : p.expiry.hours < 24 ? "text-amber-400" : "text-muted-foreground";
                  const isExpanded = expandedPos === p.id;
                  return (
                    <>
                      <tr key={p.id}
                        className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer"
                        onClick={() => setExpandedPos(isExpanded ? null : p.id)}
                      >
                        <td className="px-3 py-2 max-w-[200px] truncate">
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[9px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
                            {p.slug ? (
                              <a href={`https://polymarket.com/market/${p.slug}`} target="_blank" rel="noopener noreferrer"
                                className="text-foreground hover:text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}>
                                {p.market_title}
                              </a>
                            ) : <span className="text-foreground">{p.market_title}</span>}
                          </span>
                        </td>
                        <td className={`px-3 py-2 font-medium ${p.side === "YES" ? "text-green-500" : "text-orange-400"}`}>{p.side}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{Number(p.entry_price).toFixed(4)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.currentNum !== null ? (
                            <span className={p.currentNum > Number(p.entry_price) ? "text-green-500" : p.currentNum < Number(p.entry_price) ? "text-red-500" : "text-muted-foreground"}>
                              {p.currentNum.toFixed(4)}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">${Number(p.size_usd).toFixed(0)}</td>
                        <td className={`px-3 py-2 font-medium ${pnlClass}`}>
                          {p.currentNum !== null ? `${p.unrealized >= 0 ? "+" : ""}${p.unrealized.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px]">{p.category}</span>
                        </td>
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${expiryClass}`}>{p.expiry.text}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${stratColors[p.strategy] || "bg-gray-500/20 text-gray-400"}`}>
                            {p.strategy}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.confidence != null ? (
                            <span className={p.confidence >= 0.8 ? "text-green-500" : p.confidence >= 0.6 ? "text-amber-400" : "text-muted-foreground"}>
                              {(p.confidence * 100).toFixed(0)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatSGT(p.opened_at)}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.id}-detail`} className="bg-muted/30">
                          <td colSpan={11} className="px-4 py-3">
                            <div className="space-y-2 text-sm">
                              {p.reasoning && (
                                <div>
                                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">LLM Reasoning</span>
                                  <p className="mt-1 text-foreground leading-relaxed">{p.reasoning}</p>
                                </div>
                              )}
                              {!p.reasoning && p.entry_reasoning && (
                                <div>
                                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Entry Reasoning</span>
                                  <p className="mt-1 text-foreground leading-relaxed">{p.entry_reasoning}</p>
                                </div>
                              )}
                              {!p.reasoning && !p.entry_reasoning && (
                                <p className="text-muted-foreground italic text-xs">No reasoning recorded.</p>
                              )}
                              {p.edge_source && (
                                <div>
                                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Edge Source</span>
                                  <p className="mt-1 text-foreground">{p.edge_source}</p>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-[10px] text-muted-foreground border-t border-border">
                                <span>Opened: {formatSGT(p.opened_at)}</span>
                                {p.confidence != null && <span>Confidence: {(p.confidence * 100).toFixed(0)}%</span>}
                                {p.ev_estimate_pct != null && <span>EV: {(p.ev_estimate_pct * 100).toFixed(1)}%</span>}
                                <span>Shares: {Number(p.shares).toFixed(2)}</span>
                                <span>Size: ${Number(p.size_usd).toFixed(2)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                <tr className="border-t-2 border-border font-semibold bg-muted/30">
                  <td className="px-3 py-2" colSpan={4}>Total ({positions.length})</td>
                  <td className="px-3 py-2">${totalDeployed.toFixed(0)}</td>
                  <td className={`px-3 py-2 ${totalUnrealized >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {totalUnrealized !== 0 ? `${totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2" colSpan={5}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent trades */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Recent Trades ({trades.length})</h2>
        {trades.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted-foreground">No trades yet</div>
        ) : (
          <div className="space-y-2">
            {trades.slice(0, 10).map((d) => {
              const isExp = expandedDec === d.id;
              return (
                <div key={d.id} className="card p-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setExpandedDec(isExp ? null : d.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold text-sm ${d.action.includes("YES") ? "text-green-500" : "text-orange-400"}`}>
                      {d.action}
                    </span>
                    {d.size_usd > 0 && <span className="text-xs text-muted-foreground">${d.size_usd.toFixed(0)}</span>}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${stratColors[d.strategy] || "bg-gray-500/20 text-gray-400"}`}>
                      {d.strategy}
                    </span>
                    {d.confidence > 0 && (
                      <span className="text-[10px] text-muted-foreground">{(d.confidence * 100).toFixed(0)}% conf</span>
                    )}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      d.status === "filled" ? "bg-green-500/20 text-green-400" :
                      d.status === "rejected" ? "bg-red-500/20 text-red-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>{d.status}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatSGT(d.decided_at)}</span>
                  </div>
                  <p className={`text-xs text-muted-foreground mt-1 ${isExp ? "" : "line-clamp-2"}`}>{d.reasoning}</p>
                  {isExp && (
                    <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
                      {d.edge_source && <p><span className="text-amber-400 font-medium">Edge:</span> {d.edge_source}</p>}
                      {d.ev_estimate_pct > 0 && <p>EV: {(d.ev_estimate_pct * 100).toFixed(1)}%</p>}
                      {d.risk_gate_rejection && <p className="text-red-400">Rejected: {d.risk_gate_rejection}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
