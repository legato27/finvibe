"use client";
import { useState } from "react";
import { useWatchlists, useCreateWatchlist, useDeleteWatchlist, useAddStock, useRemoveStock } from "@/lib/supabase/hooks";
import { StockSearch } from "@/components/shared/StockSearch";
import { Plus, Trash2, X, List, Search, Building2, TrendingUp, TrendingDown } from "lucide-react";

export default function WatchlistPage() {
  const { data: watchlists, isLoading } = useWatchlists();
  const createWatchlist = useCreateWatchlist();
  const deleteWatchlist = useDeleteWatchlist();
  const addStock = useAddStock();
  const removeStock = useRemoveStock();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const activeWatchlist = watchlists?.find((w: any) => w.id === activeId) || watchlists?.[0];

  function handleAddStock(ticker: string, _name: string) {
    if (activeWatchlist) {
      addStock.mutate({ watchlistId: activeWatchlist.id, ticker });
      setShowSearch(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">Watchlists</h1>
        <div className="text-slate-500 animate-pulse">Loading watchlists...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Watchlists</h1>
        <button
          onClick={() => setShowNewList(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Watchlist
        </button>
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
          <button onClick={() => setShowNewList(false)} className="text-slate-500 hover:text-slate-300">
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
                  : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <List className="w-4 h-4" />
                <span>{wl.name}</span>
                <span className="text-[10px] text-slate-600">({wl.watchlist_items?.length || 0})</span>
              </div>
              {!wl.is_default && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${wl.name}"?`)) deleteWatchlist.mutate(wl.id);
                  }}
                  className="text-slate-600 hover:text-red-400"
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
                <span className="card-title">{activeWatchlist.name}</span>
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
                <div className="py-12 text-center text-slate-500 text-sm">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No stocks yet. Click &quot;Add Stock&quot; to search and add.
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {activeWatchlist.watchlist_items?.map((item: any) => {
                    const stock = item.stock_catalog;
                    if (!stock) return null;
                    return (
                      <div key={item.id} className="flex items-center justify-between px-3 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-primary">{stock.ticker}</span>
                              {stock.moat_rating && stock.moat_rating !== "None" && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                  stock.moat_rating === "Wide" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                                }`}>
                                  {stock.moat_rating}
                                </span>
                              )}
                              {stock.enrichment_status === "pending" && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded animate-pulse">pending</span>
                              )}
                              {stock.enrichment_status === "processing" && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded animate-pulse">enriching</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 truncate max-w-[250px]">
                              {stock.name || "—"}
                            </div>
                            {stock.sector && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Building2 className="w-2.5 h-2.5 text-slate-600" />
                                <span className="text-[10px] text-slate-600">{stock.sector}{stock.industry ? ` · ${stock.industry}` : ""}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {stock.last_price != null && stock.last_price > 0 && (
                            <span className="font-mono text-sm text-slate-300">${stock.last_price.toFixed(2)}</span>
                          )}
                          {stock.intrinsic_value != null && stock.last_price != null && (
                            <div className="text-right">
                              <div className="text-[10px] text-slate-600">Fair value</div>
                              <span className="font-mono text-xs text-slate-400">${stock.intrinsic_value.toFixed(2)}</span>
                            </div>
                          )}
                          {stock.margin_of_safety != null && (
                            <div className="text-right">
                              <div className="text-[10px] text-slate-600">MoS</div>
                              <span className={`font-mono text-xs flex items-center gap-0.5 ${
                                stock.margin_of_safety > 0 ? "text-green-400" : "text-red-400"
                              }`}>
                                {stock.margin_of_safety > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {(stock.margin_of_safety * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {stock.quarterly_trend && (
                            <div className="text-right">
                              <div className="text-[10px] text-slate-600">Trend</div>
                              <span className={`text-xs ${
                                stock.quarterly_trend === "up" ? "text-green-400" : stock.quarterly_trend === "down" ? "text-red-400" : "text-slate-500"
                              }`}>
                                {stock.quarterly_trend === "up" ? "↑" : stock.quarterly_trend === "down" ? "↓" : "→"} Q
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => removeStock.mutate({ watchlistId: activeWatchlist.id, stockId: stock.id })}
                            className="text-slate-700 hover:text-red-400 transition-colors ml-2"
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
            <div className="py-12 text-center text-slate-500">Create a watchlist to get started</div>
          )}
        </div>
      </div>
    </div>
  );
}
