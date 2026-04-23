"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import { usePortfolios, usePortfolioHoldings } from "@/lib/supabase/hooks";
import { StockEvents } from "@/components/stock/StockEvents";
import { StockOptionsStrategy } from "@/components/stock/StockOptionsStrategy";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import {
  ArrowLeft, TrendingUp, TrendingDown, Loader2,
  Calendar, Newspaper, DollarSign, Briefcase,
} from "lucide-react";
import { useState } from "react";

type Tab = "events" | "news" | "options";

export default function PortfolioStockPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params.ticker as string)?.toUpperCase();
  const [activeTab, setActiveTab] = useState<Tab>("events");

  // ── Portfolio position data ──────────────────────────────
  const { data: portfolios } = usePortfolios();
  const defaultPortfolio = portfolios?.[0];
  const { data: holdings } = usePortfolioHoldings(defaultPortfolio?.id ?? null);

  // Aggregate position for this ticker across all portfolios
  const position = useMemo(() => {
    if (!holdings) return null;
    const lots = holdings.filter((h) => h.ticker === ticker);
    if (!lots.length) return null;
    const totalShares = lots.reduce((s, h) => s + h.shares, 0);
    const avgCost = lots.reduce((s, h) => s + h.shares * h.cost_basis, 0) / totalShares;
    return { totalShares, avgCost, lotCount: lots.length };
  }, [holdings, ticker]);

  // ── Market data ──────────────────────────────────────────
  const { data: detail, isLoading } = useQuery({
    queryKey: ["stock-detail", ticker],
    queryFn: () => stocksApi.detail(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
  });

  const { data: stockInfo } = useQuery({
    queryKey: ["stock-info", ticker],
    queryFn: () => stocksApi.info(ticker),
    enabled: !!ticker,
    staleTime: 300_000,
  });

  const { data: thoughtsData } = useQuery({
    queryKey: ["stock-thoughts", ticker],
    queryFn: () => stocksApi.thoughts(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
    retry: false,
  });

  // Auto-refresh price on mount
  useQuery({
    queryKey: ["stock-price-refresh", ticker],
    queryFn: async () => { await stocksApi.refreshPrices([ticker]); return { at: Date.now() }; },
    enabled: !!ticker,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPrice = stockInfo?.current_price || detail?.last_price || 0;
  const thoughts = thoughtsData?.thoughts || null;

  // ── Position P&L ─────────────────────────────────────────
  const mktValue = position ? currentPrice * position.totalShares : 0;
  const costTotal = position ? position.avgCost * position.totalShares : 0;
  const gainLoss = mktValue - costTotal;
  const returnPct = costTotal > 0 ? (gainLoss / costTotal) * 100 : 0;
  const isUnderwater = gainLoss < 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "events", label: "Events", icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "news", label: "Latest News", icon: <Newspaper className="w-3.5 h-3.5" /> },
    { id: "options", label: "Options", icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 max-w-[1000px] mx-auto">
      {/* ── Header ── */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push("/portfolio")}
            className="text-muted-foreground hover:text-primary mt-1 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-primary">{ticker}</h1>
              <span className="text-lg text-foreground/80 truncate">{detail?.name || "—"}</span>
              {detail?.sector && (
                <span className="text-[10px] px-2 py-0.5 bg-muted rounded text-muted-foreground">
                  {detail.sector}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {currentPrice > 0 && (
                <span className="text-3xl font-bold font-mono">
                  ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Position Summary ── */}
      {position && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Position</span>
            {position.lotCount > 1 && (
              <span className="text-[10px] text-muted-foreground/60">{position.lotCount} lots</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Shares</div>
              <div className="text-lg font-mono font-bold">
                {position.totalShares % 1 === 0 ? position.totalShares : position.totalShares.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg Cost</div>
              <div className="text-lg font-mono font-bold">${position.avgCost.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Mkt Value</div>
              <div className="text-lg font-mono font-bold">
                {currentPrice > 0 ? `$${mktValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Unrealised P&L</div>
              {currentPrice > 0 ? (
                <div className={`flex items-center gap-1 text-lg font-mono font-bold ${isUnderwater ? "text-red-500" : "text-green-500"}`}>
                  {isUnderwater ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  {gainLoss >= 0 ? "+" : ""}${Math.abs(gainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-xs">({returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}%)</span>
                </div>
              ) : <div className="text-lg font-mono font-bold text-muted-foreground">—</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors ${
              activeTab === t.id
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "events" && <StockEvents ticker={ticker} />}

      {activeTab === "news" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Latest News — {ticker}</span>
          </div>
          <RealtimeNewsFeed tickers={[ticker]} />
        </div>
      )}

      {activeTab === "options" && currentPrice > 0 && position ? (
        <StockOptionsStrategy
          ticker={ticker}
          currentPrice={currentPrice}
          stockInfo={stockInfo}
          thoughts={thoughts}
          position={{ shares: position.totalShares, avgCost: position.avgCost }}
        />
      ) : activeTab === "options" && (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          {!position ? "No position data found for this ticker." : "Price data unavailable."}
        </div>
      )}
    </div>
  );
}
