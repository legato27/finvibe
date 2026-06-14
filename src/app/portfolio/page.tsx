"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import {
  usePortfolios,
  useCreatePortfolio,
  useDeletePortfolio,
  usePortfolioHoldings,
  useAddHolding,
  useDeleteHolding,
  useProfile,
  useFxRates,
} from "@/lib/supabase/hooks";
import {
  Plus, Trash2, X, Briefcase, TrendingUp, TrendingDown,
  Loader2, Clock, FolderOpen, Search, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { PortfolioAnalysisPanel } from "@/components/dashboard/PortfolioAnalysisPanel";
import {
  SUPPORTED_CURRENCIES,
  inferCurrency,
  convert,
  formatCurrency,
  type Currency,
  type FxRates,
} from "@/lib/currency";

/* ── Inline ticker search with dropdown ──────────────────── */
function TickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (ticker: string, name: string, currency?: string) => void;
}) {
  const t = useTranslations("portfolio");
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
            onChange(v, "", inferCurrency(v));
            setOpen(true);
          }}
          onFocus={() => query.length >= 1 && setOpen(true)}
          placeholder={t("searchTicker")}
          className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground/60 w-full min-w-0"
          required
        />
        {isLoading && query && open && (
          <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {open && query.length >= 1 && stocks.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
          {stocks.map((stock: any) => {
            const ccy = stock.currency || inferCurrency(stock.ticker);
            return (
              <button
                key={stock.ticker}
                type="button"
                onClick={() => {
                  setQuery(stock.ticker);
                  onChange(stock.ticker, stock.name, ccy);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors text-left border-b border-border/20 last:border-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-primary">{stock.ticker}</span>
                    <span className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1 rounded">{ccy}</span>
                    {stock.exchange && (
                      <span className="text-[9px] text-muted-foreground/60 bg-muted px-1 rounded">{stock.exchange}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
                </div>
                {(stock.current_price ?? stock.price) != null && (
                  <span className="font-mono text-xs text-foreground/70 flex-shrink-0 ml-2">
                    {(stock.current_price ?? stock.price).toFixed(2)} {ccy}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const hideBalances = useAppStore((s) => s.hideBalances);
  const toggleHideBalances = useAppStore((s) => s.toggleHideBalances);
  // Mask any already-formatted monetary string when balances are hidden.
  const mask = (s: string) => (hideBalances ? "••••" : s);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();
  const { data: profile } = useProfile();
  const defaultCurrency: Currency = (profile?.default_currency as Currency) || "USD";
  const { data: fxRates } = useFxRates(defaultCurrency);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    name: "",
    shares: "",
    cost_basis: "",
    acquired_date: "",
    notes: "",
    broker: "",
    currency: "USD" as Currency,
  });

  const activePortfolio = portfolios?.find((p: any) => p.id === activeId) || portfolios?.[0];
  const { data: holdings, isLoading: holdingsLoading } = usePortfolioHoldings(activePortfolio?.id ?? null);
  const addHolding = useAddHolding();
  const deleteHolding = useDeleteHolding();

  // Convert a native-currency amount to the user's default currency.
  // Falls back to the raw amount if rates aren't loaded yet.
  function toDefault(amount: number, native: Currency): number {
    const converted = convert(amount, native, defaultCurrency, fxRates as FxRates | undefined);
    return converted ?? amount;
  }

  // Pre-fill the add-investment form's currency with the user's default.
  useEffect(() => {
    setForm((prev) => (prev.ticker ? prev : { ...prev, currency: defaultCurrency }));
  }, [defaultCurrency]);

  async function handleRefreshPrices() {
    if (!positions.length || refreshing) return;
    setRefreshing(true);
    try {
      await stocksApi.refreshPrices(positions.map((p) => p.ticker));
      queryClient.invalidateQueries({ queryKey: ["portfolio-holdings"] });
    } finally {
      setRefreshing(false);
    }
  }

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
      broker: form.broker || undefined,
      currency: form.currency,
    });
    setForm({ ticker: "", name: "", shares: "", cost_basis: "", acquired_date: "", notes: "", broker: "", currency: defaultCurrency });
    setShowForm(false);
  }

  // ── Consolidate lots into positions (one row per ticker) ──
  const positions = useMemo(() => {
    if (!holdings) return [];
    const map = new Map<string, {
      ticker: string;
      name?: string;
      sector?: string;
      currency: Currency;
      totalShares: number;
      avgCostBasis: number;
      current_price?: number;
      last_price_updated_at?: string;
      lotIds: number[];
    }>();
    for (const h of holdings) {
      if (map.has(h.ticker)) {
        const pos = map.get(h.ticker)!;
        const newShares = pos.totalShares + h.shares;
        pos.avgCostBasis = (pos.totalShares * pos.avgCostBasis + h.shares * h.cost_basis) / newShares;
        pos.totalShares = newShares;
        pos.lotIds.push(h.id);
      } else {
        map.set(h.ticker, {
          ticker: h.ticker,
          name: h.name,
          sector: h.sector,
          currency: ((h.currency as Currency) || inferCurrency(h.ticker)),
          totalShares: h.shares,
          avgCostBasis: h.cost_basis,
          current_price: h.current_price,
          last_price_updated_at: h.last_price_updated_at,
          lotIds: [h.id],
        });
      }
    }
    return Array.from(map.values());
  }, [holdings]);

  // ── Aggregate stats (converted to user's default currency) ─
  const { totalCost, totalValue } = useMemo(() => {
    let cost = 0;
    let value = 0;
    for (const h of holdings || []) {
      const ccy = ((h.currency as Currency) || inferCurrency(h.ticker));
      const price = h.current_price || h.cost_basis;
      cost += toDefault(h.shares * h.cost_basis, ccy);
      value += toDefault(h.shares * price, ccy);
    }
    return { totalCost: cost, totalValue: value };
  }, [holdings, defaultCurrency, fxRates]);
  const totalGainLoss = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const positionCount = positions.length;
  const lotCount = holdings?.length || 0;

  if (portfoliosLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleHideBalances}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground rounded-lg hover:text-foreground transition-colors"
            title={hideBalances ? t("showBalances") : t("hideBalances")}
            aria-pressed={hideBalances}
          >
            {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{hideBalances ? t("showBalances") : t("hideBalances")}</span>
          </button>
          {activePortfolio && positions.length ? (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground rounded-lg hover:text-foreground transition-colors disabled:opacity-50"
              title={t("refreshNowTitle")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? tc("updating") : tc("refresh")}
            </button>
          ) : null}
          <button
            onClick={() => setShowNewPortfolio(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-muted-foreground rounded-lg hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t("newPortfolio")}
          </button>
          {activePortfolio && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t("addInvestment")}
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
            placeholder={t("namePlaceholder")}
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
            {tc("create")}
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
                    if (confirm(t("deletePrompt", { name: p.name }))) deletePortfolio.mutate(p.id);
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
              {t("noPortfoliosYet")}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3">
              <div className="stat-label flex items-center justify-between">
                <span>{t("totalValue")}</span>
                <span className="text-[9px] text-muted-foreground/70 font-mono">{defaultCurrency}</span>
              </div>
              <div className="stat-value text-lg">
                {mask(formatCurrency(totalValue, defaultCurrency, { decimals: 0 }))}
              </div>
            </div>
            <div className="card p-3">
              <div className="stat-label">{t("totalCost")}</div>
              <div className="stat-value text-lg">
                {mask(formatCurrency(totalCost, defaultCurrency, { decimals: 0 }))}
              </div>
            </div>
            <div className="card p-3">
              <div className="stat-label">{t("gainLoss")}</div>
              <div className={`text-lg font-bold font-mono flex items-center gap-1 ${
                totalGainLoss >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                {totalGainLoss >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {hideBalances
                  ? "••••"
                  : `${totalGainLoss >= 0 ? "+" : ""}${formatCurrency(Math.abs(totalGainLoss), defaultCurrency, { decimals: 0 })}`}
                <span className="text-xs ml-1">
                  ({totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="card p-3">
              <div className="stat-label">{t("positions")}</div>
              <div className="stat-value text-lg">{positionCount}</div>
              {lotCount > positionCount && (
                <div className="text-[10px] text-muted-foreground">{t("lots", { count: lotCount })}</div>
              )}
            </div>
          </div>

          {/* Add investment form */}
          {showForm && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">{t("addInvestmentTo", { name: activePortfolio?.name ?? "" })}</span>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Ticker with search — also sets currency */}
                  <TickerInput
                    value={form.ticker}
                    onChange={(ticker, name, currency) =>
                      setForm({
                        ...form,
                        ticker,
                        name,
                        currency: (currency as Currency) || form.currency,
                      })
                    }
                  />
                  <input
                    type="number"
                    step="any"
                    value={form.shares}
                    onChange={(e) => setForm({ ...form, shares: e.target.value })}
                    placeholder={t("sharesPh")}
                    className="px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                  {/* Cost + currency selector */}
                  <div className="flex items-stretch gap-1.5">
                    <input
                      type="number"
                      step="any"
                      value={form.cost_basis}
                      onChange={(e) => setForm({ ...form, cost_basis: e.target.value })}
                      placeholder={t("costPerShare")}
                      className="flex-1 min-w-0 px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
                      className="px-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      title={t("currencyTitle")}
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="date"
                    value={form.acquired_date}
                    onChange={(e) => setForm({ ...form, acquired_date: e.target.value })}
                    className="px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Broker */}
                  <input
                    list="broker-list"
                    value={form.broker}
                    onChange={(e) => setForm({ ...form, broker: e.target.value })}
                    placeholder={t("brokerPh")}
                    className="px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <datalist id="broker-list">
                    {["Tiger Brokers","Moomoo","Interactive Brokers","Saxo Bank","DBS Vickers","OCBC Securities","UOB Kay Hian","Webull","Robinhood","Fidelity","Charles Schwab","TD Ameritrade"].map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                  {/* Notes */}
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder={t("notesPh")}
                    className="sm:col-span-2 px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button type="submit" className="px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                    {tc("add")}
                  </button>
                </div>
              </form>
              {form.name && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("selectedPrefix")} <span className="font-mono text-primary">{form.ticker}</span> — {form.name}
                </div>
              )}
            </div>
          )}

          {/* AI portfolio risk analysis — prices normalized to default currency */}
          {activePortfolio && (
            <PortfolioAnalysisPanel
              portfolioId={activePortfolio.id}
              portfolioName={activePortfolio.name}
              positions={positions.map((p) => ({
                ticker: p.ticker,
                name: p.name,
                sector: p.sector,
                totalShares: p.totalShares,
                avgCostBasis: toDefault(p.avgCostBasis, p.currency),
                current_price:
                  p.current_price != null ? toDefault(p.current_price, p.currency) : undefined,
              }))}
              totalValue={totalValue}
              totalCost={totalCost}
            />
          )}

          {/* Holdings table */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span className="card-title">{activePortfolio?.name || "Holdings"}</span>
              {positions.length ? (
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Auto-refresh 60s
                </span>
              ) : null}
            </div>
            {holdingsLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !positions.length ? (
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
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Avg Cost</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Mkt Value</th>
                      <th className="text-right px-3 py-2">Gain/Loss</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Return</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {positions.map((pos) => {
                      const price = pos.current_price || 0;
                      const mktValue = pos.totalShares * price;
                      const costTotal = pos.totalShares * pos.avgCostBasis;
                      const gainLoss = price > 0 ? mktValue - costTotal : 0;
                      const returnPct = pos.avgCostBasis > 0 && price > 0
                        ? ((price - pos.avgCostBasis) / pos.avgCostBasis) * 100
                        : 0;
                      const isStale = pos.last_price_updated_at
                        ? (Date.now() - new Date(pos.last_price_updated_at).getTime()) > 24 * 60 * 60 * 1000
                        : true;
                      const nativeCcy = pos.currency;
                      const showConversion = nativeCcy !== defaultCurrency;
                      const mktValueDefault = showConversion ? toDefault(mktValue, nativeCcy) : mktValue;
                      const gainLossDefault = showConversion ? toDefault(gainLoss, nativeCcy) : gainLoss;

                      return (
                        <tr
                          key={pos.ticker}
                          className="hover:bg-accent/50 transition-colors cursor-pointer group"
                          onClick={() => router.push(`/portfolio/stock/${pos.ticker}`)}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-primary">{pos.ticker}</span>
                              <span className="text-[9px] text-amber-400/80 bg-amber-400/10 border border-amber-400/30 px-1 rounded font-mono">
                                {nativeCcy}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[180px] hidden md:table-cell">
                            {pos.name || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80">
                            {pos.totalShares % 1 === 0 ? pos.totalShares : pos.totalShares.toFixed(4).replace(/\.?0+$/, "")}
                            {pos.lotIds.length > 1 && (
                              <span className="ml-1 text-[9px] text-muted-foreground/60">{pos.lotIds.length} lots</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80 hidden sm:table-cell">
                            {mask(formatCurrency(pos.avgCostBasis, nativeCcy))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80">
                            <div className="flex items-center justify-end gap-1">
                              {price > 0 ? formatCurrency(price, nativeCcy) : "—"}
                              {isStale && price > 0 && (
                                <span title="Price may be stale (>24h)"><Clock className="w-3 h-3 text-yellow-500" /></span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground/80 hidden sm:table-cell">
                            {price > 0 ? (
                              <div className="flex flex-col items-end">
                                <span>{mask(formatCurrency(mktValue, nativeCcy, { decimals: 0 }))}</span>
                                {showConversion && !hideBalances && (
                                  <span className="text-[9px] text-muted-foreground/70">
                                    ≈ {formatCurrency(mktValueDefault, defaultCurrency, { decimals: 0 })}
                                  </span>
                                )}
                              </div>
                            ) : "—"}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                            gainLoss > 0 ? "text-green-500" : gainLoss < 0 ? "text-red-500" : "text-muted-foreground"
                          }`}>
                            {price > 0 ? (
                              <div className="flex flex-col items-end">
                                <span>
                                  {hideBalances
                                    ? "••••"
                                    : `${gainLoss >= 0 ? "+" : ""}${formatCurrency(Math.abs(gainLossDefault), defaultCurrency, { decimals: 0 })}`}
                                </span>
                                <span className="text-[10px] sm:hidden">{returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%</span>
                              </div>
                            ) : "—"}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold hidden sm:table-cell ${
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
                                const msg = pos.lotIds.length > 1
                                  ? `Delete all ${pos.lotIds.length} lots of ${pos.ticker}?`
                                  : `Delete ${pos.ticker}?`;
                                if (confirm(msg)) deleteHolding.mutate(pos.lotIds);
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
