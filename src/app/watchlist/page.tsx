"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatchlists, useCreateWatchlist, useDeleteWatchlist, useAddStock, useRemoveStock, useLLMAnalysisBatch, usePortfolios, useCreatePortfolio, useAddHolding } from "@/lib/supabase/hooks";
import { StockSearch } from "@/components/shared/StockSearch";
import { Plus, Trash2, X, List, Search, Building2, TrendingUp, TrendingDown, Brain, RefreshCw, Briefcase, FolderPlus } from "lucide-react";
import { stocksApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

/* ── Add-to-Portfolio Modal ─────────────────────────────────── */
function AddToPortfolioModal({
  ticker,
  stockName,
  currentPrice,
  onClose,
}: {
  ticker: string;
  stockName: string | null;
  currentPrice: number | null;
  onClose: () => void;
}) {
  const { data: portfolios } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const addHolding = useAddHolding();

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState(currentPrice?.toFixed(2) ?? "");
  const [acquiredDate, setAcquiredDate] = useState(new Date().toISOString().slice(0, 10));
  const [broker, setBroker] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Auto-select first portfolio
  const effectivePortfolioId = selectedPortfolioId ?? portfolios?.[0]?.id ?? null;

  async function handleSubmit() {
    setError(null);
    const sharesNum = parseFloat(shares);
    const costNum = parseFloat(costBasis);
    if (!sharesNum || sharesNum <= 0) { setError("Enter a valid number of shares"); return; }
    if (!costNum || costNum < 0) { setError("Enter a valid cost basis"); return; }

    setSubmitting(true);
    try {
      let portfolioId = effectivePortfolioId;

      if (creatingNew) {
        if (!newPortfolioName.trim()) { setError("Enter a portfolio name"); setSubmitting(false); return; }
        const newP = await createPortfolio.mutateAsync({ name: newPortfolioName.trim() });
        portfolioId = newP.id;
      }

      if (!portfolioId) { setError("No portfolio selected"); setSubmitting(false); return; }

      await addHolding.mutateAsync({
        ticker,
        shares: sharesNum,
        cost_basis: costNum,
        portfolio_id: portfolioId,
        acquired_date: acquiredDate || undefined,
        broker: broker || undefined,
        notes: notes || undefined,
      });
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setError(e?.message || "Failed to add holding");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header border-b border-border/40">
          <div>
            <span className="card-title">Add to Portfolio</span>
            <div className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono text-primary">{ticker}</span>
              {stockName && <span> &mdash; {stockName}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Portfolio selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Portfolio</label>
            {!creatingNew ? (
              <div className="space-y-2">
                <select
                  value={effectivePortfolioId ?? ""}
                  onChange={(e) => setSelectedPortfolioId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {portfolios?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</option>
                  ))}
                </select>
                <button
                  onClick={() => setCreatingNew(true)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> Create new portfolio
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  placeholder="New portfolio name..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={() => setCreatingNew(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Use existing portfolio instead
                </button>
              </div>
            )}
          </div>

          {/* Investment details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Shares</label>
              <input
                type="number"
                step="any"
                min="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cost / Share</label>
              <input
                type="number"
                step="any"
                min="0"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Acquired Date</label>
              <input
                type="date"
                value={acquiredDate}
                onChange={(e) => setAcquiredDate(e.target.value)}
                className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Broker</label>
              <input
                list="modal-broker-list"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g. Tiger, IBKR"
                className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <datalist id="modal-broker-list">
                {["Tiger Brokers","Moomoo","Interactive Brokers","Saxo Bank","DBS Vickers","OCBC Securities","UOB Kay Hian","Webull","Robinhood","Fidelity","Charles Schwab"].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes <span className="text-muted-foreground/50">(optional)</span></label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. DCA, earnings play…"
              className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}
          {success && <div className="text-xs text-green-400">Added to portfolio!</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting || success}
            className="w-full py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Adding..." : success ? "Added!" : "Add to Portfolio"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: watchlists, isLoading } = useWatchlists();
  const createWatchlist = useCreateWatchlist();
  const deleteWatchlist = useDeleteWatchlist();
  const addStock = useAddStock();
  const removeStock = useRemoveStock();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [portfolioModal, setPortfolioModal] = useState<{ ticker: string; name: string | null; price: number | null } | null>(null);

  const activeWatchlist = watchlists?.find((w: any) => w.id === activeId) || watchlists?.[0];

  // Gather all tickers from active watchlist for batch LLM analysis fetch
  const activeTickers = useMemo(() => {
    if (!activeWatchlist?.watchlist_items) return [];
    return activeWatchlist.watchlist_items
      .map((item: any) => item.stock_catalog?.ticker)
      .filter(Boolean) as string[];
  }, [activeWatchlist]);

  const { data: llmMap } = useLLMAnalysisBatch(activeTickers);

  function handleAddStock(ticker: string, _name: string) {
    if (activeWatchlist) {
      addStock.mutate({ watchlistId: activeWatchlist.id, ticker });
      setShowSearch(false);
    }
  }

  async function handleRefreshPrices() {
    if (refreshing || !activeTickers.length) return;
    setRefreshing(true);
    setRefreshError(false);
    try {
      await stocksApi.refreshPrices(activeTickers);
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function isStale(iso: string | null | undefined): boolean {
    if (!iso) return true;
    return Date.now() - new Date(iso).getTime() > 3600_000; // > 1 hour
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Watchlists</h1>
        <div className="text-muted-foreground animate-pulse">Loading watchlists...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Watchlists</h1>
        <div className="flex items-center gap-2">
          {activeTickers.length > 0 && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 ${
                refreshError ? "text-red-400 hover:text-red-300" : "text-muted-foreground hover:text-foreground"
              }`}
              title={refreshError ? "Refresh failed — click to retry" : "Refresh prices now"}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Updating..." : refreshError ? "Retry" : "Refresh"}
            </button>
          )}
          <button
            onClick={() => setShowNewList(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Watchlist
          </button>
        </div>
      </div>

      {/* New watchlist form */}
      {showNewList && (
        <div className="card p-3 flex items-center gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Watchlist name..."
            className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button
            onClick={() => {
              if (newListName.trim()) {
                createWatchlist.mutate({ name: newListName.trim() });
                setNewListName("");
                setShowNewList(false);
              }
            }}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg"
          >
            Create
          </button>
          <button onClick={() => setShowNewList(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Watchlist sidebar */}
        <div className="card p-2 space-y-0.5">
          {watchlists?.map((wl: any) => (
            <button
              key={wl.id}
              onClick={() => setActiveId(wl.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                activeWatchlist?.id === wl.id
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <div className="flex items-center gap-2">
                <List className="w-4 h-4" />
                <span>{wl.name}</span>
                <span className="text-[10px] text-muted-foreground/60">({wl.watchlist_items?.length || 0})</span>
              </div>
              {!wl.is_default && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${wl.name}"?`)) deleteWatchlist.mutate(wl.id);
                  }}
                  className="text-muted-foreground/50 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </button>
          ))}
        </div>

        {/* Active watchlist content */}
        <div className="card">
          {activeWatchlist ? (
            <>
              <div className="card-header">
                <div className="flex items-center gap-2">
                  <span className="card-title">{activeWatchlist.name}</span>
                  {activeTickers.length > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showSearch ? (
                    <StockSearch
                      onSelect={handleAddStock}
                      onClose={() => setShowSearch(false)}
                      placeholder="Search by ticker or name..."
                    />
                  ) : (
                    <button
                      onClick={() => setShowSearch(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Stock
                    </button>
                  )}
                </div>
              </div>

              {activeWatchlist.watchlist_items?.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No stocks yet. Click &quot;Add Stock&quot; to search and add.
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {activeWatchlist.watchlist_items?.map((item: any) => {
                    const stock = item.stock_catalog;
                    if (!stock) return null;

                    const llm = llmMap?.[stock.ticker];
                    const isEtf = stock.is_etf || stock.asset_type === "etf";

                    // Sector display logic
                    let sectorDisplay: string | null = null;
                    let sectorIsAi = false;
                    if (!isEtf) {
                      if (stock.sector && stock.sector.trim() && stock.sector !== "-") {
                        // If multiple sectors (comma-separated), show first + count
                        const parts = stock.sector.split(",").map((s: string) => s.trim()).filter(Boolean);
                        sectorDisplay = parts[0];
                        if (parts.length > 1) {
                          sectorDisplay += ` +${parts.length - 1}`;
                        }
                      } else if (llm?.llm_sector) {
                        sectorDisplay = llm.llm_sector;
                        sectorIsAi = true;
                      }
                    }

                    // Moat display logic
                    const moatRating = stock.moat_rating || (llm?.llm_moat !== "None" ? llm?.llm_moat : null);
                    const moatIsAi = !stock.moat_rating && !!llm?.llm_moat;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3 py-3 hover:bg-accent/50 transition-colors cursor-pointer group"
                        onClick={() => router.push(`/stock/${stock.ticker}`)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-primary">{stock.ticker}</span>
                              {moatRating && moatRating !== "None" && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                  moatRating === "Wide" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                                }`}>
                                  {moatRating}{moatIsAi ? " (AI)" : ""}
                                </span>
                              )}
                              {stock.enrichment_status === "pending" && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded animate-pulse">pending</span>
                              )}
                              {stock.enrichment_status === "processing" && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded animate-pulse">enriching</span>
                              )}
                              {llm?.thoughts_json && (
                                <span title="FinVibe's Thoughts available"><Brain className="w-3 h-3 text-primary/50" /></span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[130px] sm:max-w-[250px]">
                              {stock.name || "—"}
                            </div>
                            {sectorDisplay && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Building2 className="w-2.5 h-2.5 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground/60">
                                  {sectorDisplay}
                                  {sectorIsAi ? " (AI)" : ""}
                                  {stock.industry && !sectorIsAi ? ` · ${stock.industry}` : ""}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                          {stock.last_price != null && stock.last_price > 0 && (
                            <div className="text-right">
                              <span className="font-mono text-sm text-foreground">${stock.last_price.toFixed(2)}</span>
                              {stock.last_price_updated_at && (
                                <div className={`text-[10px] ${isStale(stock.last_price_updated_at) ? "text-amber-400/70" : "text-muted-foreground/40"}`}>
                                  {timeAgo(stock.last_price_updated_at)}
                                </div>
                              )}
                            </div>
                          )}
                          {stock.intrinsic_value != null && stock.last_price != null && (
                            <div className="text-right hidden sm:block">
                              <div className="text-[10px] text-muted-foreground/60">Fair Value</div>
                              <span className="font-mono text-xs text-muted-foreground">${stock.intrinsic_value.toFixed(2)}</span>
                            </div>
                          )}
                          {stock.margin_of_safety != null && (
                            <div className="text-right hidden sm:block">
                              <div className="text-[10px] text-muted-foreground/60">MoS</div>
                              <span className={`font-mono text-xs flex items-center gap-0.5 ${
                                stock.margin_of_safety > 0 ? "text-green-400" : "text-red-400"
                              }`}>
                                {stock.margin_of_safety > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {(stock.margin_of_safety * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {/* AI Intrinsic Value */}
                          {llm?.llm_intrinsic_value != null && (
                            <div className="text-right hidden lg:block">
                              <div className="text-[10px] text-blue-400/70">Intrinsic (AI)</div>
                              <span className="font-mono text-xs text-blue-400">
                                ${Number(llm.llm_intrinsic_value).toFixed(2)}
                              </span>
                            </div>
                          )}
                          {/* AI MoS */}
                          {llm?.llm_margin_of_safety != null && (
                            <div className="text-right hidden lg:block">
                              <div className="text-[10px] text-blue-400/70">MoS (AI)</div>
                              <span className={`font-mono text-xs ${
                                Number(llm.llm_margin_of_safety) > 0 ? "text-green-400" : "text-red-400"
                              }`}>
                                {(Number(llm.llm_margin_of_safety) * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {stock.quarterly_trend && (
                            <div className="text-right hidden sm:block">
                              <div className="text-[10px] text-muted-foreground/60">Trend</div>
                              <span className={`text-xs ${
                                stock.quarterly_trend === "up" ? "text-green-400" : stock.quarterly_trend === "down" ? "text-red-400" : "text-muted-foreground"
                              }`}>
                                {stock.quarterly_trend === "up" ? "↑" : stock.quarterly_trend === "down" ? "↓" : "→"} Q
                              </span>
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPortfolioModal({ ticker: stock.ticker, name: stock.name || null, price: stock.last_price ?? null });
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                            title="Add to portfolio"
                          >
                            <Briefcase className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStock.mutate({ watchlistId: activeWatchlist.id, stockId: stock.id });
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Create a watchlist to get started</div>
          )}
        </div>
      </div>

      {/* Add to Portfolio Modal */}
      {portfolioModal && (
        <AddToPortfolioModal
          ticker={portfolioModal.ticker}
          stockName={portfolioModal.name}
          currentPrice={portfolioModal.price}
          onClose={() => setPortfolioModal(null)}
        />
      )}
    </div>
  );
}
