"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useWatchlists, useCreateWatchlist, useDeleteWatchlist, useAddStock, useRemoveStock, useLLMAnalysisBatch, usePortfolios, useCreatePortfolio, useAddHolding, useRenameWatchlist } from "@/lib/supabase/hooks";
import { StockSearch } from "@/components/shared/StockSearch";
import { type VerdictJson } from "@/components/ui/VerdictBadge";
import { type PamSummary } from "@/components/shared/PamBadge";
import WatchlistTable, { type WatchRow, type OptStrategy } from "@/components/watchlist/WatchlistTable";
import { Plus, Trash2, X, List, Search, FolderPlus, Pencil, Check, RefreshCw } from "lucide-react";
import { stocksApi, modelsApi } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const tw = useTranslations("watchlist");
  const tp = useTranslations("portfolio");
  const tc = useTranslations("common");
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
    if (!sharesNum || sharesNum <= 0) { setError(tp("errEnterShares")); return; }
    if (!costNum || costNum < 0) { setError(tp("errEnterCost")); return; }

    setSubmitting(true);
    try {
      let portfolioId = effectivePortfolioId;

      if (creatingNew) {
        if (!newPortfolioName.trim()) { setError(tp("errEnterPortfolioName")); setSubmitting(false); return; }
        const newP = await createPortfolio.mutateAsync({ name: newPortfolioName.trim() });
        portfolioId = newP.id;
      }

      if (!portfolioId) { setError(tp("errNoPortfolioSelected")); setSubmitting(false); return; }

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
      setError(e?.message || tp("errAddFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header border-b border-border/40">
          <div>
            <span className="card-title">{tw("addToPortfolioTitle")}</span>
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
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tp("selectPortfolio")}</label>
            {!creatingNew ? (
              <div className="space-y-2">
                <select
                  value={effectivePortfolioId ?? ""}
                  onChange={(e) => setSelectedPortfolioId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {portfolios?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}{p.is_default ? tp("defaultSuffix") : ""}</option>
                  ))}
                </select>
                <button
                  onClick={() => setCreatingNew(true)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> {tp("createNewPortfolio")}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  placeholder={tp("newPortfolioNamePh")}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={() => setCreatingNew(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tp("useExistingInstead")}
                </button>
              </div>
            )}
          </div>

          {/* Investment details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tp("sharesLabel")}</label>
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
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tp("costPerShareLabel")}</label>
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
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tp("acquiredDate")}</label>
              <input
                type="date"
                value={acquiredDate}
                onChange={(e) => setAcquiredDate(e.target.value)}
                className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tp("broker")}</label>
              <input
                list="modal-broker-list"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder={tp("brokerExamples")}
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
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{tp("notesLabel")} <span className="text-muted-foreground/50">({tc("optional")})</span></label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tp("notesExamples")}
              className="w-full px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <div className="text-xs text-danger">{error}</div>}
          {success && <div className="text-xs text-success">{tp("addedToPortfolio")}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting || success}
            className="w-full py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? tp("adding") : success ? tp("added") : tw("addToPortfolio")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const t = useTranslations("watchlist");
  const tc = useTranslations("common");
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

  // Live prices for the active list (60s) — overlay on the synced last_price.
  const { data: livePrices } = useQuery<Array<{ ticker: string; price: number | null }>>({
    queryKey: ["wl-live-prices", activeTickers],
    queryFn: () => stocksApi.refreshPrices(activeTickers),
    enabled: activeTickers.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const priceMap = useMemo(
    () => new Map((livePrices ?? []).map((p) => [p.ticker, p.price])),
    [livePrices],
  );

  // Unified verdict per ticker — THE one signal shown on the row (PAM and the
  // other sources live inside it as evidence; see VerdictCard on the stock page).
  const { data: verdictMap } = useQuery<Record<string, VerdictJson | null>>({
    queryKey: ["wl-verdicts", activeTickers],
    queryFn: () => stocksApi.verdictBatch(activeTickers),
    enabled: activeTickers.length > 0,
    staleTime: 5 * 60_000,
  });

  // PAM (price-action) strategy per ticker — compact summary for the list view.
  const { data: pamMap } = useQuery<Record<string, PamSummary | null>>({
    queryKey: ["wl-pam", activeTickers],
    queryFn: () => stocksApi.pamBatch(activeTickers),
    enabled: activeTickers.length > 0,
    staleTime: 5 * 60_000,
  });

  // Option strategy: the ranked options book gives the current recommended
  // strategy per name. Fetched once (covers elevated-vol names only); others
  // show "—". Independent of the active list, so it's shared across watchlists.
  const { data: optBook } = useQuery<{ ranked?: Array<{ ticker: string; strategy?: string; conviction?: number | null; side?: string | null }> }>({
    queryKey: ["wl-options-ranked"],
    queryFn: () => modelsApi.optionsRanked(),
    staleTime: 10 * 60_000,
  });
  const optMap = useMemo(() => {
    const m = new Map<string, OptStrategy>();
    for (const r of optBook?.ranked ?? []) {
      if (r?.ticker && r.strategy) {
        m.set(r.ticker.toUpperCase(), {
          strategy: r.strategy,
          conviction: r.conviction ?? null,
          side: r.side ?? null,
        });
      }
    }
    return m;
  }, [optBook]);

  // Flatten + enrich each watchlist item into the row shape the grid consumes.
  const rows = useMemo<WatchRow[]>(() => {
    const items = activeWatchlist?.watchlist_items ?? [];
    return items
      .map((item: any): WatchRow | null => {
        const stock = item.stock_catalog;
        if (!stock) return null;
        const llm = llmMap?.[stock.ticker];
        const livePrice = priceMap.get(stock.ticker) ?? null;
        const isEtf = stock.is_etf || stock.asset_type === "etf";

        // Sector display (first part + "+N"), with AI fallback — mirrors the old row logic.
        let sectorDisplay: string | null = null;
        let sectorGroup: string | null = null;
        let sectorIsAi = false;
        if (!isEtf) {
          if (stock.sector && stock.sector.trim() && stock.sector !== "-") {
            const parts = stock.sector.split(",").map((s: string) => s.trim()).filter(Boolean);
            sectorGroup = parts[0];
            sectorDisplay = parts.length > 1 ? `${parts[0]} +${parts.length - 1}` : parts[0];
          } else if (llm?.llm_sector) {
            sectorDisplay = llm.llm_sector;
            sectorGroup = llm.llm_sector;
            sectorIsAi = true;
          }
        }

        const moat = stock.moat_rating || (llm?.llm_moat !== "None" ? llm?.llm_moat : null) || null;
        const moatIsAi = !stock.moat_rating && !!llm?.llm_moat;

        return {
          id: item.id,
          stockId: stock.id,
          ticker: stock.ticker,
          name: stock.name ?? null,
          sector: sectorDisplay,
          sectorGroup,
          sectorIsAi,
          industry: !isEtf && !sectorIsAi ? stock.industry ?? null : null,
          isEtf,
          moat,
          moatIsAi,
          enrichmentStatus: stock.enrichment_status ?? null,
          hasThoughts: !!llm?.thoughts_json,
          price: livePrice ?? stock.last_price ?? null,
          livePrice,
          lastPriceUpdatedAt: stock.last_price_updated_at ?? null,
          fairValue: stock.intrinsic_value ?? null,
          mos: stock.margin_of_safety ?? null,
          aiIntrinsic: llm?.llm_intrinsic_value != null ? Number(llm.llm_intrinsic_value) : null,
          aiMos: llm?.llm_margin_of_safety != null ? Number(llm.llm_margin_of_safety) : null,
          trend: stock.quarterly_trend ?? null,
          verdict: verdictMap?.[stock.ticker] ?? null,
          pam: pamMap?.[stock.ticker] ?? null,
          opt: optMap.get(stock.ticker) ?? null,
        };
      })
      .filter(Boolean) as WatchRow[];
  }, [activeWatchlist, llmMap, priceMap, verdictMap, pamMap, optMap]);

  const renameWatchlist = useRenameWatchlist();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <div className="text-muted-foreground animate-pulse">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {activeTickers.length > 0 && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 ${
                refreshError ? "text-danger hover:text-danger" : "text-muted-foreground hover:text-foreground"
              }`}
              title={refreshError ? t("refreshFailedTitle") : t("refreshNowTitle")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? tc("updating") : refreshError ? tc("retry") : tc("refresh")}
            </button>
          )}
          <button
            onClick={() => setShowNewList(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t("newWatchlist")}
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
            placeholder={t("namePlaceholder")}
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
            {tc("create")}
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
                    if (confirm(t("deletePrompt", { name: wl.name }))) deleteWatchlist.mutate(wl.id);
                  }}
                  className="text-muted-foreground/50 hover:text-danger"
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
                  {editingName ? (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && nameDraft.trim()) {
                            renameWatchlist.mutate({ id: activeWatchlist.id, name: nameDraft });
                            setEditingName(false);
                          } else if (e.key === "Escape") setEditingName(false);
                        }}
                        className="bg-muted/50 border border-border/40 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <button
                        onClick={() => {
                          if (nameDraft.trim()) renameWatchlist.mutate({ id: activeWatchlist.id, name: nameDraft });
                          setEditingName(false);
                        }}
                        className="text-primary hover:text-primary/80"
                        aria-label="Save name"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 group/name">
                      <span className="card-title">{activeWatchlist.name}</span>
                      <button
                        onClick={() => { setNameDraft(activeWatchlist.name); setEditingName(true); }}
                        className="text-muted-foreground/40 hover:text-primary opacity-0 group-hover/name:opacity-100 transition-opacity"
                        aria-label="Rename watchlist"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                  {activeTickers.length > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      {tc("live")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showSearch ? (
                    <StockSearch
                      onSelect={handleAddStock}
                      onClose={() => setShowSearch(false)}
                      placeholder={t("searchByTickerOrName")}
                    />
                  ) : (
                    <button
                      onClick={() => setShowSearch(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t("addStock")}
                    </button>
                  )}
                </div>
              </div>

              {activeWatchlist.watchlist_items?.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {t("noStocksYet")}
                </div>
              ) : (
                <WatchlistTable
                  rows={rows}
                  onAddToPortfolio={(r) =>
                    setPortfolioModal({ ticker: r.ticker, name: r.name, price: r.price })
                  }
                  onRemove={(r) => removeStock.mutate({ watchlistId: activeWatchlist.id, stockId: r.stockId })}
                />
              )}
            </>
          ) : (
            <div className="py-12 text-center text-muted-foreground">{t("createToStart")}</div>
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
