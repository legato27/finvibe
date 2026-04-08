"use client";
import { useState } from "react";
import { usePortfolio, useAddHolding, useDeleteHolding } from "@/lib/supabase/hooks";
import { Plus, Trash2, X, Briefcase, TrendingUp, TrendingDown } from "lucide-react";

export default function PortfolioPage() {
  const { data: holdings, isLoading } = usePortfolio();
  const addHolding = useAddHolding();
  const deleteHolding = useDeleteHolding();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: "", shares: "", cost_basis: "", acquired_date: "", notes: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addHolding.mutate({
      ticker: form.ticker,
      shares: parseFloat(form.shares),
      cost_basis: parseFloat(form.cost_basis),
      acquired_date: form.acquired_date || undefined,
      notes: form.notes || undefined,
    });
    setForm({ ticker: "", shares: "", cost_basis: "", acquired_date: "", notes: "" });
    setShowForm(false);
  }

  // Aggregate portfolio stats
  const totalCost = holdings?.reduce((sum: number, h: any) => sum + h.shares * h.cost_basis, 0) || 0;
  const tickers = [...new Set(holdings?.map((h: any) => h.ticker) || [])];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Portfolio</h1>
        <div className="text-slate-500 animate-pulse">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Portfolio</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Holding
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <div className="stat-label">Total Invested</div>
          <div className="stat-value text-lg">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="card p-3">
          <div className="stat-label">Holdings</div>
          <div className="stat-value text-lg">{holdings?.length || 0}</div>
        </div>
        <div className="card p-3">
          <div className="stat-label">Tickers</div>
          <div className="stat-value text-lg">{tickers.length}</div>
        </div>
        <div className="card p-3">
          <div className="stat-label">Avg Position</div>
          <div className="stat-value text-lg">
            ${holdings?.length ? (totalCost / holdings.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}
          </div>
        </div>
      </div>

      {/* Add holding form */}
      {showForm && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Add New Holding</span>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300">
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
          <span className="card-title">Holdings</span>
        </div>
        {!holdings?.length ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No holdings yet. Click &quot;Add Holding&quot; to track your positions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-border/30">
                  <th className="text-left px-3 py-2">Ticker</th>
                  <th className="text-right px-3 py-2">Shares</th>
                  <th className="text-right px-3 py-2">Cost/Share</th>
                  <th className="text-right px-3 py-2">Total Cost</th>
                  <th className="text-right px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {holdings.map((h: any) => (
                  <tr key={h.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono font-bold text-primary">{h.ticker}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">{h.shares}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">${h.cost_basis.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      ${(h.shares * h.cost_basis).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500 text-xs">
                      {h.acquired_date || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate">
                      {h.notes || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => { if (confirm("Delete this holding?")) deleteHolding.mutate(h.id); }}
                        className="text-slate-600 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
