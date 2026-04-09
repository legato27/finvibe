"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stocksApi, brokerApi } from "@/lib/api";
import {
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
  Loader2, Clock, FolderOpen, Search,
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

const BROKER_META: Record<string, { label: string; icon: string }> = {
  ibkr: { label: "Interactive Brokers", icon: "IB" },
  moomoo: { label: "Moomoo", icon: "MM" },
};

function BrokerPanel({ portfolioId }: { portfolioId: number }) {
  const { data: connections, isLoading } = useBrokerConnections();
  const createConnection = useCreateBrokerConnection();
  const deleteConnection = useDeleteBrokerConnection();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addBroker, setAddBroker] = useState<"ibkr" | "moomoo">("ibkr");
  const [flexToken, setFlexToken] = useState("");
  const [flexQueryId, setFlexQueryId] = useState("");
  const [syncing, setSyncing] = useState<Record<number, boolean>>({});
  const [syncResults, setSyncResults] = useState<Record<number, any>>({});
  const [uploadConnId, setUploadConnId] = useState<number | null>(null);

  const portfolioConnections = connections?.filter((c) => c.portfolio_id === portfolioId) || [];

  async function handleSync(conn: BrokerConnection, csvData?: string) {
    setSyncing((s) => ({ ...s, [conn.id]: true }));
    setSyncResults((s) => ({ ...s, [conn.id]: null }));
    try {
      const result = await brokerApi.sync(conn.id, csvData);
      setSyncResults((s) => ({ ...s, [conn.id]: result }));
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["broker-connections"] });
    } catch (e: any) {
      setSyncResults((s) => ({ ...s, [conn.id]: { status: "error", error: e?.response?.data?.error || e.message } }));
    } finally {
      setSyncing((s) => ({ ...s, [conn.id]: false }));
    }
  }

  function handleCsvUpload(connId: number) {
    setUploadConnId(connId);
    fileRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploadConnId == null) return;
    const text = await file.text();
    const conn = portfolioConnections.find((c) => c.id === uploadConnId);
    if (conn) await handleSync(conn, text);
    e.target.value = "";
    setUploadConnId(null);
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    createConnection.mutate({
      portfolio_id: portfolioId,
      broker: addBroker,
      flex_token: addBroker === "ibkr" ? flexToken : undefined,
      flex_query_id: addBroker === "ibkr" ? flexQueryId : undefined,
    });
    setShowAdd(false);
    setFlexToken("");
    setFlexQueryId("");
  }

  return (
    <div className="card p-3">
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileSelected} />

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Broker Sync
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-accent text-muted-foreground rounded hover:text-foreground transition-colors"
        >
          <Plus className="w-3 h-3" /> Connect
        </button>
      </div>

      {/* Add connection form */}
      {showAdd && (
        <form onSubmit={handleAddSubmit} className="bg-background/50 border border-border rounded-lg p-3 mb-2 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddBroker("ibkr")}
              className={`flex-1 py-2 text-xs rounded border transition-colors ${
                addBroker === "ibkr"
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Interactive Brokers
            </button>
            <button
              type="button"
              onClick={() => setAddBroker("moomoo")}
              className={`flex-1 py-2 text-xs rounded border transition-colors ${
                addBroker === "moomoo"
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Moomoo
            </button>
          </div>

          {addBroker === "ibkr" ? (
            <>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Set up a Flex Query in IBKR Account Management: Reports &gt; Flex Queries &gt; create a query for &quot;Open Positions&quot;. Copy the token and query ID.
              </p>
              <input
                type="text"
                value={flexToken}
                onChange={(e) => setFlexToken(e.target.value)}
                placeholder="Flex Web Service Token"
                className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground font-mono"
                required
              />
              <input
                type="text"
                value={flexQueryId}
                onChange={(e) => setFlexQueryId(e.target.value)}
                placeholder="Flex Query ID"
                className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground font-mono"
                required
              />
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Moomoo syncs via CSV export. After connecting, click &quot;Upload CSV&quot; to import your positions from the Moomoo app (Portfolio &gt; Export).
            </p>
          )}

          <div className="flex items-center gap-2">
            <button type="submit" className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-medium">
              Connect {addBroker === "ibkr" ? "IBKR" : "Moomoo"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Connection list */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse py-2">Loading...</div>
      ) : portfolioConnections.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2 text-center">
          No broker connections yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {portfolioConnections.map((conn) => {
            const meta = BROKER_META[conn.broker];
            const isSyncing = syncing[conn.id];
            const result = syncResults[conn.id];

            return (
              <div key={conn.id} className="flex items-center justify-between bg-background/50 border border-border/50 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded">{meta?.icon}</span>
                    {meta?.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    {conn.last_sync_at && (
                      <span className="flex items-center gap-0.5">
                        {conn.last_sync_status === "success" ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                        ) : conn.last_sync_status === "error" ? (
                          <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                        ) : null}
                        {new Date(conn.last_sync_at).toLocaleDateString()}
                        {conn.sync_count > 0 && ` (${conn.sync_count}x)`}
                      </span>
                    )}
                    {!conn.last_sync_at && <span>Never synced</span>}
                  </div>
                  {conn.last_sync_error && (
                    <div className="text-[9px] text-red-400 truncate max-w-[200px]" title={conn.last_sync_error}>
                      {conn.last_sync_error}
                    </div>
                  )}
                  {result && (
                    <div className={`text-[9px] mt-0.5 ${result.status === "success" ? "text-green-400" : "text-red-400"}`}>
                      {result.status === "success"
                        ? `${result.synced} positions (${result.added} new, ${result.updated} updated, ${result.removed} removed)`
                        : `Error: ${result.error}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {conn.broker === "moomoo" ? (
                    <button
                      onClick={() => handleCsvUpload(conn.id)}
                      disabled={isSyncing}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/15 text-primary rounded hover:bg-primary/25 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                      {isSyncing ? "Importing..." : "Upload CSV"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSync(conn)}
                      disabled={isSyncing}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/15 text-primary rounded hover:bg-primary/25 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                      {isSyncing ? "Syncing..." : "Sync"}
                    </button>
                  )}
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
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
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
                createPortfolio.mutate({ name: newPortfolioName.trim() }, {
                  onSuccess: () => setShowConnectPrompt(true),
                });
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

      {/* Connect broker prompt after portfolio creation */}
      {showConnectPrompt && activePortfolio && (
        <div className="card p-4 border-primary/30 bg-primary/5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-primary" />
                Connect a broker to &quot;{activePortfolio.name}&quot;?
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Import your holdings automatically from Interactive Brokers or Moomoo.
              </p>
            </div>
            <button onClick={() => setShowConnectPrompt(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setShowConnectPrompt(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            You can always connect a broker later from the sidebar.
          </p>
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
          {activePortfolio && (
            <BrokerPanel portfolioId={activePortfolio.id} />
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
