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
  strategy: string;
  resolution_at: string | null;
  slug: string | null;
}

interface Decision {
  id: string;
  decided_at: string;
  action: string;
  strategy: string;
  size_usd: number;
  confidence: number;
  reasoning: string;
  status: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

type SortKey = "market" | "side" | "entry" | "current" | "size" | "pnl" | "category" | "expires" | "strategy";

export default function PolyEdgePage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("expires");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    async function load() {
      try {
        const [p, pos, dec] = await Promise.all([
          fetch(`${POLYEDGE_API}/api/portfolio`).then((r) => r.json()),
          fetch(`${POLYEDGE_API}/api/positions`).then((r) => r.json()),
          fetch(`${POLYEDGE_API}/api/decisions?limit=20`).then((r) => r.json()),
        ]);
        setPortfolio(p);
        setPositions(pos);
        setDecisions(dec);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            PolyEdge
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-500">LIVE</span>
          </h1>
          <p className="text-xs text-muted-foreground">Autonomous Polymarket trader powered by Claude</p>
        </div>
        <a href="https://polyedge.vibelife.sg" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
          Full Dashboard &rarr;
        </a>
      </div>

      {error && (
        <div className="card border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">Cannot connect to PolyEdge API</div>
      )}

      {/* Stats */}
      {portfolio && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Bankroll", value: `$${portfolio.bankroll_usd.toFixed(0)}`, sub: `$${portfolio.open_positions_value.toFixed(0)} deployed` },
            { label: "Total Equity", value: `$${totalEquity.toFixed(0)}`, sub: "cash + positions" },
            { label: "P&L", value: `${portfolio.total_pnl >= 0 ? "+" : ""}$${portfolio.total_pnl.toFixed(2)}`, sub: `${((portfolio.total_pnl / 5000) * 100).toFixed(1)}%`, cls: portfolio.total_pnl >= 0 ? "text-green-500" : "text-red-500" },
            { label: "Win Rate", value: portfolio.win_rate != null ? `${(portfolio.win_rate * 100).toFixed(0)}%` : "N/A", sub: portfolio.wins != null ? `${portfolio.wins}W / ${portfolio.losses}L` : undefined },
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
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const pnlClass = p.unrealized > 0.01 ? "text-green-500" : p.unrealized < -0.01 ? "text-red-500" : "";
                  const expiryClass = p.expiry.hours < 2 ? "text-red-500" : p.expiry.hours < 24 ? "text-amber-400" : "text-muted-foreground";
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <td className="px-3 py-2 max-w-[200px] truncate">
                        {p.slug ? (
                          <a href={`https://polymarket.com/market/${p.slug}`} target="_blank" rel="noopener noreferrer"
                            className="text-foreground hover:text-primary hover:underline">
                            {p.market_title}
                          </a>
                        ) : <span className="text-foreground">{p.market_title}</span>}
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
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border font-semibold bg-muted/30">
                  <td className="px-3 py-2" colSpan={4}>Total ({positions.length})</td>
                  <td className="px-3 py-2">${totalDeployed.toFixed(0)}</td>
                  <td className={`px-3 py-2 ${totalUnrealized >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {totalUnrealized !== 0 ? `${totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2" colSpan={3}></td>
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
            {trades.slice(0, 10).map((d) => (
              <div key={d.id} className="card p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${d.action.includes("YES") ? "text-green-500" : "text-orange-400"}`}>
                    {d.action}
                  </span>
                  {d.size_usd > 0 && <span className="text-xs text-muted-foreground">${d.size_usd.toFixed(0)}</span>}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${stratColors[d.strategy] || "bg-gray-500/20 text-gray-400"}`}>
                    {d.strategy}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(d.decided_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.reasoning}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
