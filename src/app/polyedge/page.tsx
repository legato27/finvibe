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
  if (!dateStr) return "—";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diff / 60000)}m`;
}

const stratColors: Record<string, string> = {
  logical_arb: "bg-blue-500/20 text-blue-400",
  base_rate: "bg-amber-500/20 text-amber-400",
  claude_edge: "bg-emerald-500/20 text-emerald-400",
  copy_trade: "bg-cyan-500/20 text-cyan-400",
  xplatform_arb: "bg-purple-500/20 text-purple-400",
};

export default function PolyEdgePage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState(false);

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

  const trades = decisions.filter((d) => d.action !== "SKIP");
  const totalEquity = portfolio ? portfolio.bankroll_usd + portfolio.open_positions_value : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            PolyEdge
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-500">
              LIVE
            </span>
          </h1>
          <p className="text-xs text-muted-foreground">Autonomous Polymarket trader powered by Claude</p>
        </div>
        <a
          href="https://polyedge.vibelife.sg"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Full Dashboard &rarr;
        </a>
      </div>

      {error && (
        <div className="card border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
          Cannot connect to PolyEdge API
        </div>
      )}

      {/* Stats */}
      {portfolio && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Bankroll", value: `$${portfolio.bankroll_usd.toFixed(0)}`, sub: `$${portfolio.open_positions_value.toFixed(0)} deployed` },
            { label: "Total Equity", value: `$${totalEquity.toFixed(0)}`, sub: "cash + positions" },
            { label: "P&L", value: `${portfolio.total_pnl >= 0 ? "+" : ""}$${portfolio.total_pnl.toFixed(2)}`, sub: `${((portfolio.total_pnl / 1000) * 100).toFixed(1)}%`, cls: portfolio.total_pnl >= 0 ? "text-green-500" : "text-red-500" },
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
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Open Positions ({positions.length})
        </h2>
        {positions.length === 0 ? (
          <div className="card p-4 text-center text-sm text-muted-foreground">No open positions</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">Market</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Strategy</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 max-w-[200px] truncate text-foreground">{p.market_title}</td>
                    <td className={`px-3 py-2 font-medium ${p.side === "YES" ? "text-green-500" : "text-orange-400"}`}>{p.side}</td>
                    <td className="px-3 py-2 text-muted-foreground">{Number(p.entry_price).toFixed(4)}</td>
                    <td className="px-3 py-2">${Number(p.size_usd).toFixed(0)}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{expiresIn(p.resolution_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${stratColors[p.strategy] || "bg-gray-500/20 text-gray-400"}`}>
                        {p.strategy}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent trades */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Recent Trades ({trades.length})
        </h2>
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
