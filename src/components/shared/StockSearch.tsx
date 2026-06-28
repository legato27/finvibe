"use client";
import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import { Search, Plus, TrendingUp, TrendingDown, Building2 } from "lucide-react";
import { MARKET_OPTIONS, type MarketCode } from "@/lib/currency";

interface StockResult {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  price?: number;
  current_price?: number;
  change_pct?: number;
  market_cap?: number;
  exchange?: string;
  currency?: string;
  market?: string;
}

export interface StockSelection {
  ticker: string;
  name: string;
  currency?: string;
  current_price?: number;
}

interface StockSearchProps {
  /**
   * Called when the user picks a result. Receives ticker + name by default,
   * and the full selection (including currency + price) so callers that care
   * about currency inference can use it.
   */
  onSelect: (ticker: string, name: string, extra?: StockSelection) => void;
  onClose: () => void;
  placeholder?: string;
  defaultMarket?: MarketCode;
}

export function StockSearch({
  onSelect,
  onClose,
  placeholder,
  defaultMarket = "ALL",
}: StockSearchProps) {
  const t = useTranslations("watchlist");
  const ph = placeholder ?? t("searchStocksDefault");
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<MarketCode>(defaultMarket);
  const [focused, setFocused] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results, isLoading } = useQuery({
    queryKey: ["stock_search", query, market],
    queryFn: () => stocksApi.search(query, market),
    enabled: query.length >= 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const stocks: StockResult[] = results || [];

  function formatMarketCap(cap?: number) {
    if (!cap) return "";
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
    return `$${cap.toLocaleString()}`;
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="flex items-stretch gap-1.5">
        {/* Market dropdown */}
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as MarketCode)}
          className="px-2 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          title={t("marketTitle")}
        >
          {MARKET_OPTIONS.map((m) => (
            <option key={m.code} value={m.code}>
              {m.flag} {m.code}
            </option>
          ))}
        </select>

        {/* Search input */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg focus-within:ring-1 focus-within:ring-primary">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onFocus={() => setFocused(true)}
            placeholder={ph}
            className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {isLoading && query && (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          )}
        </div>
      </div>

      {focused && query.length >= 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-3 text-xs text-muted-foreground animate-pulse">{t("searching")}</div>
          )}
          {!isLoading && stocks.length === 0 && query.length >= 2 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {t("noResultsFor", { query })}
              <button
                onClick={() => onSelect(query, query, { ticker: query, name: query })}
                className="ml-2 text-primary hover:underline"
              >
                {t("addAnyway", { query })}
              </button>
            </div>
          )}
          {stocks.map((stock) => {
            const price = stock.current_price ?? stock.price;
            const ccy = stock.currency || "USD";
            return (
              <button
                key={stock.ticker}
                onClick={() =>
                  onSelect(stock.ticker, stock.name, {
                    ticker: stock.ticker,
                    name: stock.name,
                    currency: ccy,
                    current_price: price,
                  })
                }
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left border-b border-border/20 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-primary">{stock.ticker}</span>
                    <span className="text-[9px] text-warning bg-warning/10 border border-warning/30 px-1 rounded">
                      {ccy}
                    </span>
                    {stock.market && stock.market !== "US" && (
                      <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">
                        {stock.market}
                      </span>
                    )}
                    {stock.exchange && (
                      <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">{stock.exchange}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
                  {stock.sector && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Building2 className="w-2.5 h-2.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{stock.sector}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {price != null && (
                    <span className="font-mono text-xs text-foreground">
                      {price.toFixed(2)} {ccy}
                    </span>
                  )}
                  {stock.change_pct != null && (
                    <span className={`flex items-center gap-0.5 font-mono text-[10px] ${
                      stock.change_pct >= 0 ? "text-success" : "text-danger"
                    }`}>
                      {stock.change_pct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%
                    </span>
                  )}
                  {stock.market_cap && (
                    <span className="text-[9px] text-muted-foreground">{formatMarketCap(stock.market_cap)}</span>
                  )}
                </div>

                <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
