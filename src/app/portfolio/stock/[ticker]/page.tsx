"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { stocksApi } from "@/lib/api";
import { verdictToAction, verdictConviction } from "@/lib/signals";
import { usePortfolios, usePortfolioHoldings, useLLMAnalysis } from "@/lib/supabase/hooks";
import { StockHeroHeader } from "@/components/stock/StockHeroHeader";
import { StockEvents } from "@/components/stock/StockEvents";
import { OptionsStrategyRecommendation } from "@/components/stock/OptionsStrategyRecommendation";
import { PortfolioAnalysis } from "@/components/stock/PortfolioAnalysis";
import { TransactionHistory } from "@/components/stock/TransactionHistory";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import {
  TrendingUp, TrendingDown, Loader2,
  Calendar, DollarSign, Briefcase, Brain, ReceiptText,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

type Tab = "analysis" | "events_news" | "options" | "transactions";

export default function PortfolioStockPage() {
  const t = useTranslations("portfolio");
  const hideBalances = useAppStore((s) => s.hideBalances);
  const params = useParams();
  const ticker = (params.ticker as string)?.toUpperCase();
  const [activeTab, setActiveTab] = useState<Tab>("analysis");
  const [generatingThoughts, setGeneratingThoughts] = useState(false);

  // ── Portfolio position data ──────────────────────────────
  const { data: portfolios } = usePortfolios();
  const defaultPortfolio = portfolios?.[0];
  const { data: holdings } = usePortfolioHoldings(defaultPortfolio?.id ?? null);

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
    refetchInterval: generatingThoughts ? 8_000 : false,
  });

  const { data: supabaseLlm } = useLLMAnalysis(ticker);

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
  const thoughtsGeneratedAt = thoughtsData?.generated_at || null;
  // Unified arbitrated verdict (6-state) mapped to the buy/hold/avoid action
  // vocabulary. Prefer it over the un-arbitrated LLM thoughts.verdict so the
  // hero, options strategy, and position advice all speak the same call.
  const unifiedAction = detail?.verdict?.state ? verdictToAction(detail.verdict.state) : undefined;

  // ── Position P&L ─────────────────────────────────────────
  const mktValue = position ? currentPrice * position.totalShares : 0;
  const costTotal = position ? position.avgCost * position.totalShares : 0;
  const gainLoss = mktValue - costTotal;
  const returnPct = costTotal > 0 ? (gainLoss / costTotal) * 100 : 0;
  const isUnderwater = gainLoss < 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "analysis", label: t("tabAnalysis"), icon: <Brain className="w-3.5 h-3.5" /> },
    { id: "transactions", label: t("tabTransactions"), icon: <ReceiptText className="w-3.5 h-3.5" /> },
    { id: "events_news", label: t("tabEventsNews"), icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "options", label: t("tabOptions"), icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 max-w-[1000px] mx-auto">
      {/* ── Header ── */}
      <StockHeroHeader
        ticker={ticker}
        backHref="/portfolio"
        detail={detail}
        stockInfo={stockInfo}
        currentPrice={currentPrice}
        verdict={unifiedAction ?? thoughts?.verdict}
        conviction={detail?.verdict?.state ? verdictConviction(detail.verdict.state, detail.verdict.confidence) : thoughts?.conviction}
        llm={detail?.llm || supabaseLlm}
      />

      {/* ── Position Summary ── */}
      {position && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("yourPosition")}</span>
            {position.lotCount > 1 && (
              <span className="text-[10px] text-muted-foreground/60">{t("lots", { count: position.lotCount })}</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("sharesLabel")}</div>
              <div className="text-lg font-mono font-bold">
                {position.totalShares % 1 === 0 ? position.totalShares : position.totalShares.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("columnAvgCost")}</div>
              <div className="text-lg font-mono font-bold">${position.avgCost.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("columnMktValue")}</div>
              <div className="text-lg font-mono font-bold">
                {currentPrice > 0 ? (hideBalances ? "••••" : `$${mktValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("unrealisedPnl")}</div>
              {currentPrice > 0 ? (
                <div className={`flex items-center gap-1 text-lg font-mono font-bold ${isUnderwater ? "text-danger" : "text-success"}`}>
                  {isUnderwater ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  {hideBalances ? "••••" : `${gainLoss >= 0 ? "+" : ""}$${Math.abs(gainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-mono text-xs font-semibold rounded-md transition-colors border ${
              activeTab === t.id
                ? "bg-primary/15 text-primary border-primary/40"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
            title={t.label}
          >
            {t.icon}<span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}

      {activeTab === "analysis" && position && currentPrice > 0 && (
        <PortfolioAnalysis
          ticker={ticker}
          currentPrice={currentPrice}
          position={{ shares: position.totalShares, avgCost: position.avgCost }}
          stockInfo={stockInfo}
          thoughts={thoughts}
          verdictAction={unifiedAction}
          thoughtsGeneratedAt={thoughtsGeneratedAt}
          thoughtsData={thoughtsData}
          isGenerating={generatingThoughts && !thoughts}
          onGenerate={() => setGeneratingThoughts(true)}
          onGenerateDone={() => setGeneratingThoughts(false)}
        />
      )}

      {activeTab === "analysis" && (!position || currentPrice === 0) && (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          {!position ? t("noPositionData") : t("priceUnavailable")}
        </div>
      )}

      {activeTab === "transactions" && (
        <TransactionHistory
          ticker={ticker}
          portfolioId={defaultPortfolio?.id ?? 0}
          lots={(holdings ?? []).filter((h) => h.ticker === ticker)}
        />
      )}

      {activeTab === "events_news" && (
        <div className="space-y-4">
          <StockEvents ticker={ticker} />
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t("latestNewsFor", { ticker })}</span>
            </div>
            <RealtimeNewsFeed tickers={[ticker]} />
          </div>
        </div>
      )}

      {activeTab === "options" && currentPrice > 0 && position ? (
        <OptionsStrategyRecommendation
          ticker={ticker}
          currentPrice={currentPrice}
          stockInfo={stockInfo}
          thoughts={thoughts}
          verdictAction={unifiedAction}
          position={{ shares: position.totalShares, avgCost: position.avgCost }}
        />
      ) : activeTab === "options" && (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          {!position ? t("noPositionForTicker") : t("priceUnavailable")}
        </div>
      )}
    </div>
  );
}
