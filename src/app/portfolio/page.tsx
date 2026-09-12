"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Stat from "@/components/ui/Stat";
import Freshness from "@/components/ui/Freshness";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import {
  usePortfolios,
  usePortfolioHoldingCounts,
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
      <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg focus-within:ring-1 focus-within:ring-signal">
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
          <div className="w-3.5 h-3.5 border-2 border-signal/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
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
                    <span className="font-mono text-sm font-bold text-signal">{stock.ticker}</span>
                    <span className="text-[9px] text-signal-caution bg-signal-caution/10 border border-signal-caution/30 px-1 rounded">{ccy}</span>
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
  const confirm = useConfirm();
  const hideBalances = useAppStore((s) => s.hideBalances);
  const toggleHideBalances = useAppStore((s) => s.toggleHideBalances);
  // Mask any already-formatted monetary string when balances are hidden.
  const mask = (s: string) => (hideBalances ? "••••" : s);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const { data: counts } = usePortfolioHoldingCounts();
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

  // Which portfolio to land on before the user picks one. This used to be
  // portfolios[0] — the default, which every account is created with and which
  // is empty until something is put in it. A holder whose positions sit in any
  // other portfolio arrived to TOTAL VALUE $0, POSITIONS 0 and "No investments
  // yet": three statements that the account owns nothing, on the page where
  // that number is the entire point.
  //
  // The sidebar always lists every portfolio, so this was one click from
  // correct rather than a dead end — but a confident zero is worse than an
  // awkward one, and the click only helps someone who already doubts the page.
  //
  // Any holding qualifies here. The covered-call panel additionally requires a
  // 100+ share lot because it cannot write a contract against less; this page
  // is for looking at what you own, and 40 shares is something to look at.
  const preferredPortfolio = useMemo(() => {
    const list = portfolios ?? [];
    if (!list.length) return undefined;
    if (!counts) return list[0];
    return list.find((p: any) => (counts.get(p.id)?.total ?? 0) > 0) ?? list[0];
  }, [portfolios, counts]);

  const activePortfolio =
    portfolios?.find((p: any) => p.id === activeId) || preferredPortfolio;
  const { data: holdings, isLoading: holdingsLoading } = usePortfolioHoldings(activePortfolio?.id ?? null);
  const addHolding = useAddHolding();
  const deleteHolding = useDeleteHolding();

  /**
   * Convert a native-currency amount to the user's default currency.
   *
   * Returns null when the rate table cannot do it. It used to return the
   * RAW amount instead, which meant that with /api/fx/rates unavailable an
   * HKD lot was added to an SGD total one-for-one — a confidently wrong
   * number, on the page where the number is the point, with nothing on
   * screen to say so. FX is staged now (a week-old major is off by well
   * under a percent), so this path is rare; when it is hit, the totals say
   * what they had to leave out rather than quietly absorbing it.
   */
  function toDefault(amount: number, native: Currency): number | null {
    return convert(amount, native, defaultCurrency, fxRates as FxRates | undefined);
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
  const { totalCost, totalValue, unconverted } = useMemo(() => {
    let cost = 0;
    let value = 0;
    let skipped = 0;
    for (const h of holdings || []) {
      const ccy = ((h.currency as Currency) || inferCurrency(h.ticker));
      const price = h.current_price || h.cost_basis;
      const c = toDefault(h.shares * h.cost_basis, ccy);
      const v = toDefault(h.shares * price, ccy);
      // Both or neither: a lot counted in the value but not the cost would
      // show as pure gain.
      if (c === null || v === null) {
        skipped += 1;
        continue;
      }
      cost += c;
      value += v;
    }
    return { totalCost: cost, totalValue: value, unconverted: skipped };
  }, [holdings, defaultCurrency, fxRates]);
  const totalGainLoss = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const positionCount = positions.length;
  const lotCount = holdings?.length || 0;

  if (portfoliosLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
        <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}
        </div>
      </div>
    );
  }

  type PositionRow = (typeof positions)[number];
  const holdingColumns: Column<PositionRow>[] = [
    {
      key: "ticker", header: t("columnTicker"), sortable: true, sortValue: (r) => r.ticker,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-foreground">{r.ticker}</span>
          <span className="rounded-full border border-signal-caution/30 bg-signal-caution/10 px-1 font-mono text-[9px] text-signal-caution">{r.currency}</span>
        </span>
      ),
    },
    {
      key: "name", header: t("columnName"), sortable: true, sortValue: (r) => r.name?.toLowerCase(), hideBelow: "md",
      cell: (r) => <span className="block max-w-[180px] truncate text-muted-foreground">{r.name || "—"}</span>,
    },
    {
      key: "shares", header: t("columnShares"), sortable: true, sortValue: (r) => r.totalShares, align: "right",
      cell: (r) => (
        <span className="nums font-mono">
          {r.totalShares % 1 === 0 ? r.totalShares : r.totalShares.toFixed(4).replace(/\.?0+$/, "")}
          {r.lotIds.length > 1 && <span className="ml-1 text-[9px] text-dim">{t("lots", { count: r.lotIds.length })}</span>}
        </span>
      ),
    },
    {
      key: "avgCost", header: t("columnAvgCost"), sortable: true, sortValue: (r) => r.avgCostBasis, align: "right", hideBelow: "sm",
      cell: (r) => <span className="nums font-mono">{mask(formatCurrency(r.avgCostBasis, r.currency))}</span>,
    },
    {
      key: "price", header: t("columnPrice"), sortable: true, sortValue: (r) => r.current_price ?? null, align: "right",
      cell: (r) => {
        const price = r.current_price || 0;
        const stale = r.last_price_updated_at ? Date.now() - new Date(r.last_price_updated_at).getTime() > 24 * 3600_000 : true;
        return (
          <span className="nums inline-flex items-center justify-end gap-1 font-mono">
            {price > 0 ? formatCurrency(price, r.currency) : "—"}
            {stale && price > 0 && <span title={t("priceStale")}><Clock className="h-3 w-3 text-signal-caution" aria-label={t("priceStale")} /></span>}
          </span>
        );
      },
    },
    {
      key: "mktValue", header: t("columnMktValue"), sortable: true, align: "right", hideBelow: "sm",
      sortValue: (r) => { const p = r.current_price || 0; const v = r.totalShares * p; return r.currency !== defaultCurrency ? toDefault(v, r.currency) ?? v : v; },
      cell: (r) => {
        const price = r.current_price || 0; if (!(price > 0)) return "—";
        const v = r.totalShares * price; const conv = r.currency !== defaultCurrency;
        return (
          <span className="nums flex flex-col items-end font-mono">
            <span>{mask(formatCurrency(v, r.currency, { decimals: 0 }))}</span>
            {conv && !hideBalances && <span className="text-[9px] text-dim">≈ {formatCurrency(toDefault(v, r.currency), defaultCurrency, { decimals: 0 })}</span>}
          </span>
        );
      },
    },
    {
      key: "gainLoss", header: t("gainLoss"), sortable: true, align: "right",
      sortValue: (r) => { const p = r.current_price || 0; return p > 0 ? r.totalShares * (p - r.avgCostBasis) : null; },
      cell: (r) => {
        const price = r.current_price || 0; if (!(price > 0)) return "—";
        const gl = r.totalShares * (price - r.avgCostBasis);
        const glDefault = r.currency !== defaultCurrency ? toDefault(gl, r.currency) : gl;
        const pct = r.avgCostBasis > 0 ? ((price - r.avgCostBasis) / r.avgCostBasis) * 100 : 0;
        return (
          <span className={`nums flex flex-col items-end font-mono font-semibold ${gl > 0 ? "text-signal-long" : gl < 0 ? "text-signal-short" : "text-muted-foreground"}`}>
            <span>{hideBalances ? "••••" : glDefault == null ? "—" : `${gl >= 0 ? "+" : "−"}${formatCurrency(Math.abs(glDefault), defaultCurrency, { decimals: 0 })}`}</span>
            <span className="text-[10px] sm:hidden">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
          </span>
        );
      },
    },
    {
      key: "return", header: t("columnReturn"), sortable: true, align: "right", hideBelow: "sm",
      sortValue: (r) => { const p = r.current_price || 0; return p > 0 && r.avgCostBasis > 0 ? ((p - r.avgCostBasis) / r.avgCostBasis) * 100 : null; },
      cell: (r) => {
        const price = r.current_price || 0; if (!(price > 0 && r.avgCostBasis > 0)) return "—";
        const pct = ((price - r.avgCostBasis) / r.avgCostBasis) * 100;
        return <span className={`nums font-mono font-semibold ${pct > 0 ? "text-signal-long" : pct < 0 ? "text-signal-short" : "text-muted-foreground"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
      },
    },
    {
      key: "actions", header: <span className="sr-only">{tc("delete")}</span>, ariaLabel: tc("delete"), align: "right",
      cell: (r) => (
        <button
          type="button"
          onClick={async () => {
            const msg = r.lotIds.length > 1 ? t("deleteAllLotsPrompt", { count: r.lotIds.length, ticker: r.ticker }) : t("deleteTickerPrompt", { ticker: r.ticker });
            if (await confirm(msg, { destructive: true })) deleteHolding.mutate(r.lotIds);
          }}
          aria-label={`${tc("delete")} ${r.ticker}`}
          className="rounded-md p-1.5 text-dim hover:bg-signal-short-bg hover:text-signal-short"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
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
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
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
            className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-signal"
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
          {portfolios?.map((p: any) => {
            const on = activePortfolio?.id === p.id;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1 rounded-control pr-1 transition-colors ${on ? "bg-signal-bg text-signal" : "text-muted-foreground hover:bg-accent"}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(p.id)}
                  aria-current={on ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-3 py-2 text-left text-sm"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{p.name}</span>
                </button>
                {!p.is_default && (
                  <button
                    type="button"
                    onClick={async () => { if (await confirm(t("deletePrompt", { name: p.name }), { destructive: true })) deletePortfolio.mutate(p.id); }}
                    aria-label={`${tc("delete")} ${p.name}`}
                    className="rounded-md p-1.5 text-dim hover:text-signal-short"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          {(!portfolios || portfolios.length === 0) && (
            <div className="px-3 py-4 text-center text-muted-foreground text-xs">
              {t("noPortfoliosYet")}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card">
              <Stat
                label={<span className="flex items-center justify-between gap-2"><span>{t("totalValue")}</span><span className="font-mono text-[9px] text-dim">{defaultCurrency}</span></span>}
                value={mask(formatCurrency(totalValue, defaultCurrency, { decimals: 0 }))}
                sub={unconverted > 0 ? (
                  <span className="text-signal-caution" title="FX rates are unavailable, so holdings in another currency cannot be converted and are left out of the totals.">
                    excludes {unconverted} holding{unconverted === 1 ? "" : "s"} — no FX rate
                  </span>
                ) : undefined}
                size="sm"
              />
            </div>
            <div className="card">
              <Stat label={t("totalCost")} value={mask(formatCurrency(totalCost, defaultCurrency, { decimals: 0 }))} size="sm" />
            </div>
            <div className="card">
              <Stat
                label={t("gainLoss")}
                value={hideBalances ? "••••" : `${totalGainLoss >= 0 ? "+" : "−"}${formatCurrency(Math.abs(totalGainLoss), defaultCurrency, { decimals: 0 })}`}
                sub={`${totalReturnPct >= 0 ? "+" : ""}${totalReturnPct.toFixed(1)}%`}
                tone={totalGainLoss >= 0 ? "long" : "short"}
                size="sm"
              />
            </div>
            <div className="card">
              <Stat label={t("positions")} value={positionCount} sub={lotCount > positionCount ? t("lots", { count: lotCount }) : undefined} size="sm" />
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
                    className="px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-signal"
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
                      className="flex-1 min-w-0 px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-signal"
                      required
                    />
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
                      className="px-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-signal cursor-pointer"
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
                    className="px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-signal"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Broker */}
                  <input
                    list="broker-list"
                    value={form.broker}
                    onChange={(e) => setForm({ ...form, broker: e.target.value })}
                    placeholder={t("brokerPh")}
                    className="px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-signal"
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
                    className="sm:col-span-2 px-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-signal"
                  />
                  <button type="submit" className="px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                    {tc("add")}
                  </button>
                </div>
              </form>
              {form.name && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("selectedPrefix")} <span className="font-mono text-signal">{form.ticker}</span> — {form.name}
                </div>
              )}
            </div>
          )}

          {/* AI portfolio risk analysis — prices normalized to default currency */}
          {activePortfolio && (
            <PortfolioAnalysisPanel
              portfolioId={activePortfolio.id}
              portfolioName={activePortfolio.name}
              /* Every figure the model sees is in one currency. A position
                 that cannot be converted is dropped rather than passed
                 through at its native number — the analysis reasons about
                 weights, and an unconverted HKD line would read as a
                 position several times its real size. */
              positions={positions.flatMap((p) => {
                const avgCostBasis = toDefault(p.avgCostBasis, p.currency);
                if (avgCostBasis == null) return [];
                return [{
                  ticker: p.ticker,
                  name: p.name,
                  sector: p.sector,
                  totalShares: p.totalShares,
                  avgCostBasis,
                  current_price:
                    p.current_price != null
                      ? toDefault(p.current_price, p.currency) ?? undefined
                      : undefined,
                }];
              })}
              totalValue={totalValue}
              totalCost={totalCost}
            />
          )}

          {/* Holdings table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">{activePortfolio?.name || t("holdings")}</span>
              {positions.length ? <Freshness note="60s" /> : null}
            </div>
            {holdingsLoading ? (
              <div className="flex items-center justify-center py-12" role="status">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : !positions.length ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden="true" />
                {t("noInvestmentsYet")}
              </div>
            ) : (
              <DataTable
                caption={activePortfolio?.name || t("holdings")}
                columns={holdingColumns}
                rows={positions}
                rowKey={(r) => r.ticker}
                rowHref={(r) => `/stock/${r.ticker}`}
                defaultSort={{ key: "mktValue", dir: "desc" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
