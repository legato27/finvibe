"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stocksApi, brokerApi } from "@/lib/api";
import {
  useUser,
  usePortfolios,
  useCreatePortfolio,
  useDeletePortfolio,
  usePortfolioHoldings,
  useAddHolding,
  useDeleteHolding,
  useBrokerConnections,
  useCreateBrokerConnection,
  useDeleteBrokerConnection,
  type HoldingWithPrice,
  type BrokerConnection,
} from "@/lib/supabase/hooks";
import {
  Plus, Trash2, X, Briefcase, TrendingUp, TrendingDown,
  Loader2, Clock, FolderOpen, Search, DollarSign,
  RefreshCw, Link2, Unlink, AlertCircle, CheckCircle2,
} from "lucide-react";

/* ── Inline ticker search with dropdown ──────────────────── */
function TickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (ticker: string, name: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results, isLoading } = useQuery({
    queryKey: ["stock_search", query],
    queryFn: () => stocksApi.search(query),
    enabled: query.length >= 1 && open,
    staleTime: 30_000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const stocks = results || [];

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg focus-within:ring-1 focus-within:ring-primary">
        <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setQuery(v);
            onChange(v, "");
            setOpen(true);
          }}
          onFocus={() => query.length >= 1 && setOpen(true)}
          placeholder="Search ticker..."
          className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/60 w-full min-w-0"
          required
        />
        {isLoading && query && open && (
          <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {open && query.length >= 1 && stocks.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
          {stocks.map((stock: any) => (
            <button
              key={stock.ticker}
              type="button"
              onClick={() => {
                setQuery(stock.ticker);
                onChange(stock.ticker, stock.name);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors text-left border-b border-border/20 last:border-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-primary">{stock.ticker}</span>
                  {stock.exchange && (
                    <span className="text-[9px] text-muted-foreground/60 bg-muted px-1 rounded">{stock.exchange}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
              </div>
              {stock.price != null && (
                <span className="font-mono text-xs text-foreground/70 flex-shrink-0 ml-2">
                  ${stock.price.toFixed(2)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Broker Connection Panel ─────────────────────────────── */

const BROKER_DEFAULTS: Record<string, { port: number; label: string; icon: string }> = {
  ibkr: { port: 4001, label: "Interactive Brokers", icon: "🏦" },
  moomoo: { port: 11111, label: "Moomoo", icon: "🐄" },
};

function BrokerPanel({ portfolioId, userId }: { portfolioId: number; userId: string }) {
  const { data: connections, isLoading } = useBrokerConnections();
  const createConnection = useCreateBrokerConnection();
  const deleteConnection = useDeleteBrokerConnection();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ broker: "ibkr", host: "127.0.0.1", port: "4001", account_id: "", trd_env: "REAL" });
  const [syncing, setSyncing] = useState<Record<number, boolean>>({});
  const [syncResults, setSyncResults] = useState<Record<number, any>>({});

  const portfolioConnections = connections?.filter((c) => c.portfolio_id === portfolioId) || [];

  async function handleSync(conn: BrokerConnection) {
    setSyncing((s) => ({ ...s, [conn.id]: true }));
    setSyncResults((s) => ({ ...s, [conn.id]: null }));
    try {
      const result = await brokerApi.sync(conn.id, userId);
      setSyncResults((s) => ({ ...s, [conn.id]: result }));
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["broker-connections"] });
    } catch (e: any) {
      setSyncResults((s) => ({ ...s, [conn.id]: { status: "error", error: e?.response?.data?.detail || e.message } }));
    } finally {
      setSyncing((s) => ({ ...s, [conn.id]: false }));
    }
  }

  async function handleSyncAll() {
    for (const conn of portfolioConnections) {
      if (conn.enabled) await handleSync(conn);
    }
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    createConnection.mutate({
      portfolio_id: portfolioId,
      broker: addForm.broker,
      host: addForm.host,
      port: parseInt(addForm.port),
      account_id: addForm.account_id || undefined,
      trd_env: addForm.trd_env,
    });
    setShowAdd(false);
    setAddForm({ broker: "ibkr", host: "127.0.0.1", port: "4001", account_id: "", trd_env: "REAL" });
  }

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Broker Sync
        </span>
        <div className="flex items-center gap-1.5">
          {portfolioConnections.length > 0 && (
            <button
              onClick={handleSyncAll}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/15 text-primary rounded hover:bg-primary/25 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Sync All
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-accent text-muted-foreground rounded hover:text-foreground transition-colors"
          >
            <Plus className="w-3 h-3" /> Connect
          </button>
        </div>
      </div>

      {/* Add connection form */}
      {showAdd && (
        <form onSubmit={handleAddSubmit} className="bg-background/50 border border-border rounded-lg p-3 mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={addForm.broker}
              onChange={(e) => {
                const broker = e.target.value;
                setAddForm({
                  ...addForm,
                  broker,
                  port: String(BROKER_DEFAULTS[broker]?.port || 4001),
                });
              }}
              className="px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground"
            >
              <option value="ibkr">Interactive Brokers</option>
              <option value="moomoo">Moomoo</option>
            </select>
            <input
              type="text"
              value={addForm.host}
              onChange={(e) => setAddForm({ ...addForm, host: e.target.value })}
              placeholder="Host"
              className="px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              value={addForm.port}
              onChange={(e) => setAddForm({ ...addForm, port: e.target.value })}
              placeholder="Port"
              className="px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground"
              required
            />
            <input
              type="text"
              value={addForm.account_id}
              onChange={(e) => setAddForm({ ...addForm, account_id: e.target.value })}
              placeholder="Account ID (optional)"
              className="px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground col-span-2"
            />
          </div>
          {addForm.broker === "moomoo" && (
            <select
              value={addForm.trd_env}
              onChange={(e) => setAddForm({ ...addForm, trd_env: e.target.value })}
              className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground"
            >
              <option value="REAL">Real Trading</option>
              <option value="SIMULATE">Paper Trading</option>
            </select>
          )}
          <div className="flex items-center gap-2">
            <button type="submit" className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-medium">
              Add Connection
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Connection list */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse py-2">Loading connections...</div>
      ) : portfolioConnections.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2 text-center">
          No broker connections. Click &quot;Connect&quot; to link IBKR or Moomoo.
        </div>
      ) : (
        <div className="space-y-1.5">
          {portfolioConnections.map((conn) => {
            const meta = BROKER_DEFAULTS[conn.broker];
            const isSyncing = syncing[conn.id];
            const result = syncResults[conn.id];

            return (
              <div
                key={conn.id}
                className="flex items-center justify-between bg-background/50 border border-border/50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{meta?.icon || "📡"}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      {meta?.label || conn.broker}
                      {conn.account_id && (
                        <span className="text-[9px] text-muted-foreground font-mono bg-muted px-1 rounded">
                          {conn.account_id}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>{conn.host}:{conn.port}</span>
                      {conn.last_sync_at && (
                        <span className="flex items-center gap-0.5">
                          {conn.last_sync_status === "success" ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                          ) : conn.last_sync_status === "error" ? (
                            <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                          ) : null}
                          Synced {new Date(conn.last_sync_at).toLocaleDateString()}
                          {conn.sync_count > 0 && ` (${conn.sync_count}x)`}
                        </span>
                      )}
                    </div>
                    {conn.last_sync_error && (
                      <div className="text-[9px] text-red-400 truncate max-w-[200px]" title={conn.last_sync_error}>
                        {conn.last_sync_error}
                      </div>
                    )}
                    {result && (
                      <div className={`text-[9px] mt-0.5 ${result.status === "success" ? "text-green-400" : "text-red-400"}`}>
                        {result.status === "success"
                          ? `Synced ${result.synced} positions (${result.added} new, ${result.updated} updated, ${result.removed} removed)`
                          : `Error: ${result.error}`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleSync(conn)}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/15 text-primary rounded hover:bg-primary/25 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Disconnect ${meta?.label}? Synced holdings will be removed.`))
                        deleteConnection.mutate(conn.id);
                    }}
                    className="text-muted-foreground/40 hover:text-red-500 transition-colors"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const { data: user } = useUser();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: "", name: "", shares: "", cost_basis: "", acquired_date: "", notes: "" });

  const activePortfolio = portfolios?.find((p: any) => p.id === activeId) || portfolios?.[0];
  const { data: holdings, isLoading: holdingsLoading } = usePortfolioHoldings(activePortfolio?.id ?? null);
  const addHolding = useAddHolding();
  const deleteHolding = useDeleteHolding();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activePortfolio || !form.ticker) return;
    addHolding.mutate({
      ticker: form.ticker,
      shares: parseFloat(form.shares),
      cost_basis: parseFloat(form.cost_basis),
      portfolio_id: activePortfolio.id,
      acquired_date: form.acquired_date || undefined,
      notes: form.notes || undefined,
    });
    setForm({ ticker: "", name: "", shares: "", cost_basis: "", acquired_date: "", notes: "" });
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
              <Plus className="w-3.5 h-3.5" /> Add Investment
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

          {/* Broker connections */}
          {activePortfolio && user && (
            <BrokerPanel portfolioId={activePortfolio.id} userId={user.id} />
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

          {/* Add investment form */}
          {showForm && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Add Investment to {activePortfolio?.name}</span>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* Ticker with search */}
                <TickerInput
                  value={form.ticker}
                  onChange={(ticker, name) => setForm({ ...form, ticker, name })}
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
                {/* Cost with $ prefix */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    step="any"
                    value={form.cost_basis}
                    onChange={(e) => setForm({ ...form, cost_basis: e.target.value })}
                    placeholder="Cost/share"
                    className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
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
              {form.name && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Selected: <span className="font-mono text-primary">{form.ticker}</span> — {form.name}
                </div>
              )}
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
                No investments yet. Click &quot;Add Investment&quot; to track your positions.
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
                                if (confirm("Delete this investment?")) deleteHolding.mutate(h.id);
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
