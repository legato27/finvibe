"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatchlists, useCreateWatchlist, useDeleteWatchlist, useAddStock, useRemoveStock, useLLMAnalysisBatch } from "@/lib/supabase/hooks";
import { StockSearch } from "@/components/shared/StockSearch";
import { Plus, Trash2, X, List, Search, Building2, TrendingUp, TrendingDown, Brain, RefreshCw } from "lucide-react";
import { stocksApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

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
    try {
      await stocksApi.refreshPrices(activeTickers);
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    } finally {
      setRefreshing(false);
    }
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground rounded-lg hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh prices now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Updating..." : "Refresh"}
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
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">
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

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {stock.last_price != null && stock.last_price > 0 && (
                            <span className="font-mono text-sm text-foreground">${stock.last_price.toFixed(2)}</span>
                          )}
                          {stock.intrinsic_value != null && stock.last_price != null && (
                            <div className="text-right">
                              <div className="text-[10px] text-muted-foreground/60">Fair Value</div>
                              <span className="font-mono text-xs text-muted-foreground">${stock.intrinsic_value.toFixed(2)}</span>
                            </div>
                          )}
                          {stock.margin_of_safety != null && (
                            <div className="text-right">
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
                            <div className="text-right">
                              <div className="text-[10px] text-blue-400/70">Intrinsic (AI)</div>
                              <span className="font-mono text-xs text-blue-400">
                                ${Number(llm.llm_intrinsic_value).toFixed(2)}
                              </span>
                            </div>
                          )}
                          {/* AI MoS */}
                          {llm?.llm_margin_of_safety != null && (
                            <div className="text-right">
                              <div className="text-[10px] text-blue-400/70">MoS (AI)</div>
                              <span className={`font-mono text-xs ${
                                Number(llm.llm_margin_of_safety) > 0 ? "text-green-400" : "text-red-400"
                              }`}>
                                {(Number(llm.llm_margin_of_safety) * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {stock.quarterly_trend && (
                            <div className="text-right">
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
                              removeStock.mutate({ watchlistId: activeWatchlist.id, stockId: stock.id });
                            }}
                            className="text-muted-foreground/30 hover:text-red-400 transition-colors ml-2 opacity-0 group-hover:opacity-100"
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
    </div>
  );
}
