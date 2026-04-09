"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePortfolios,
  useCreatePortfolio,
  useDeletePortfolio,
  usePortfolioHoldings,
  useAddHolding,
  useDeleteHolding,
  type HoldingWithPrice,
} from "@/lib/supabase/hooks";
import {
  Plus, Trash2, X, Briefcase, TrendingUp, TrendingDown,
  Loader2, Clock, FolderOpen,
} from "lucide-react";
import Link from "next/link";

export default function PortfolioPage() {
  const router = useRouter();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: "", shares: "", cost_basis: "", acquired_date: "", notes: "" });

  const activePortfolio = portfolios?.find((p: any) => p.id === activeId) || portfolios?.[0];
  const { data: holdings, isLoading: holdingsLoading } = usePortfolioHoldings(activePortfolio?.id ?? null);
  const addHolding = useAddHolding();
  const deleteHolding = useDeleteHolding();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activePortfolio) return;
    addHolding.mutate({
      ticker: form.ticker,
      shares: parseFloat(form.shares),
      cost_basis: parseFloat(form.cost_basis),
      portfolio_id: activePortfolio.id,
      acquired_date: form.acquired_date || undefined,
      notes: form.notes || undefined,
    });
    setForm({ ticker: "", shares: "", cost_basis: "", acquired_date: "", notes: "" });
    setShowForm(false);
  }

  // ── Aggregate stats ──────────────────────────────────────
  const totalCost = holdings?.reduce((sum, h) => sum + h.shares * h.cost_basis, 0) || 0;
  const totalValue = holdings?.reduce((sum, h) => {
    const price = h.current_price || h.cost_basis;
    return sum + h.shares * price;
  }, 0) || 0;
  const totalGainLoss = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const holdingCount = holdings?.length || 0;
  const tickerCount = new Set(holdings?.map((h) => h.ticker) || []).size;

  if (portfoliosLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Portfolio</h1>
        <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading portfolios...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Portfolio</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewPortfolio(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-muted-foreground rounded-lg hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Portfolio
          </button>
          {activePortfolio && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Holding
            </button>
          )}
        </div>
      </div>

      {/* New portfolio form */}
      {showNewPortfolio && (
        <div className="card p-3 flex items-center gap-2">
          <input
            type="text"
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            placeholder="Portfolio name..."
            className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button
            onClick={() => {
              if (newPortfolioName.trim()) {
                createPortfolio.mutate({ name: newPortfolioName.trim() });
                setNewPortfolioName("");
                setShowNewPortfolio(false);
              }
            }}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg"
          >
            Create
          </button>
          <button onClick={() => setShowNewPortfolio(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Portfolio sidebar */}
        <div className="card p-2 space-y-0.5">
          {portfolios?.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                activePortfolio?.id === p.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                <span>{p.name}</span>
              </div>
              {!p.is_default && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${p.name}"?`)) deletePortfolio.mutate(p.id);
                  }}
                  className="text-muted-foreground/30 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </button>
          ))}
          {(!portfolios || portfolios.length === 0) && (
            <div className="px-3 py-4 text-center text-muted-foreground text-xs">
              No portfolios yet
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3">
              <div className="stat-label">Total Value</div>
              <div className="stat-value text-lg">
                ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="card p-3">
              <div className="stat-label">Total Cost</div>
              <div className="stat-value text-lg">
                ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="card p-3">
              <div className="stat-label">Gain / Loss</div>
              <div className={`text-lg font-bold font-mono flex items-center gap-1 ${
                totalGainLoss >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                {totalGainLoss >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {totalGainLoss >= 0 ? "+" : ""}${Math.abs(totalGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="text-xs ml-1">
                  ({totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="card p-3">
              <div className="stat-label">Holdings</div>
              <div className="stat-value text-lg">{holdingCount}</div>
              <div className="text-[10px] text-muted-foreground">{tickerCount} ticker{tickerCount !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* Add holding form */}
          {showForm && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Add Holding to {activePortfolio?.name}</span>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <input
                  type="text"
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="Ticker (AAPL)"
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <input
                  type="number"
                  step="any"
                  value={form.shares}
                  onChange={(e) => setForm({ ...form, shares: e.target.value })}
                  placeholder="Shares"
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <input
                  type="number"
                  step="any"
                  value={form.cost_basis}
                  onChange={(e) => setForm({ ...form, cost_basis: e.target.value })}
                  placeholder="Cost/share"
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <input
                  type="date"
                  value={form.acquired_date}
                  onChange={(e) => setForm({ ...form, acquired_date: e.target.value })}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                  Add
                </button>
              </form>
            </div>
          )}

          {/* Holdings table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">{activePortfolio?.name || "Holdings"}</span>
            </div>
            {holdingsLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !holdings?.length ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No holdings yet. Click &quot;Add Holding&quot; to track your positions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                      <th className="text-left px-3 py-2">Ticker</th>
                      <th className="text-left px-3 py-2 hidden md:table-cell">Name</th>
                      <th className="text-right px-3 py-2">Shares</th>
                      <th className="text-right px-3 py-2">Avg Cost</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">Mkt Value</th>
                      <th className="text-right px-3 py-2">Gain/Loss</th>
                      <th className="text-right px-3 py-2">Return</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {holdings.map((h) => {
                      const price = h.current_price || 0;
                      const mktValue = h.shares * price;
                      const costTotal = h.shares * h.cost_basis;
                      const gainLoss = price > 0 ? mktValue - costTotal : 0;
                      const returnPct = h.cost_basis > 0 && price > 0
                        ? ((price - h.cost_basis) / h.cost_basis) * 100
                        : 0;
                      const isStale = h.last_price_updated_at
                        ? (Date.now() - new Date(h.last_price_updated_at).getTime()) > 24 * 60 * 60 * 1000
                        : true;

                      return (
                        <tr
                          key={h.id}
                          className="hover:bg-accent/50 transition-colors cursor-pointer group"
                          onClick={() => router.push(`/stock/${h.ticker}`)}
                        >
                          <td className="px-3 py-2.5">
                            <span className="font-mono font-bold text-primary">{h.ticker}</span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[180px] hidden md:table-cell">
                            {h.name || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80">{h.shares}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80">${h.cost_basis.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80">
                            <div className="flex items-center justify-end gap-1">
                              {price > 0 ? `$${price.toFixed(2)}` : "—"}
                              {isStale && price > 0 && (
                                <span title="Price may be stale (>24h)"><Clock className="w-3 h-3 text-yellow-500" /></span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80">
                            {price > 0 ? `$${mktValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                            gainLoss > 0 ? "text-green-500" : gainLoss < 0 ? "text-red-500" : "text-muted-foreground"
                          }`}>
                            {price > 0 ? (
                              <>
                                {gainLoss >= 0 ? "+" : ""}${Math.abs(gainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </>
                            ) : "—"}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                            returnPct > 0 ? "text-green-500" : returnPct < 0 ? "text-red-500" : "text-muted-foreground"
                          }`}>
                            {price > 0 ? (
                              <>
                                {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%
                              </>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this holding?")) deleteHolding.mutate(h.id);
                              }}
                              className="text-muted-foreground/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
