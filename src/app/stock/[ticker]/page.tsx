"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stocksApi, sentimentApi } from "@/lib/api";
import { useLLMAnalysis } from "@/lib/supabase/hooks";
import { PriceChart } from "@/components/stock/PriceChart";
import { SentimentPanel } from "@/components/stock/SentimentPanel";
import { FinVibeThoughts } from "@/components/stock/FinVibeThoughts";
import { ModelCards } from "@/components/stock/ModelCards";
import { TechnicalAnalysis } from "@/components/stock/TechnicalAnalysis";
import { OptionsStrategy } from "@/components/stock/OptionsStrategy";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import {
  ArrowLeft, TrendingUp, TrendingDown, Brain, Loader2,
  ChevronDown, ChevronUp, LineChart, Newspaper, Cpu, DollarSign,
} from "lucide-react";
import Link from "next/link";

type Tab = "chart" | "analysis" | "options" | "quant" | "news";

export default function StockDetailPage() {
  const params = useParams();
  const ticker = (params.ticker as string)?.toUpperCase();
  const [descExpanded, setDescExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chart");

  // ── Data fetching ──────────────────────────────────────
  const { data: detail, isLoading: detailLoading } = useQuery({
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

  const { data: supabaseLlm } = useLLMAnalysis(ticker);

  // Refresh live price on mount — updates DB so detail query stays fresh
  const qc = useQueryClient();
  useQuery({
    queryKey: ["stock-price-refresh", ticker],
    queryFn: async () => {
      await stocksApi.refreshPrices([ticker]);
      qc.invalidateQueries({ queryKey: ["stock-detail", ticker] });
      return { at: Date.now() };
    },
    enabled: !!ticker,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 2,
  });

  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="card p-12 text-center text-muted-foreground max-w-[800px] mx-auto">
        <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Stock {ticker} not found in watchlist.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Add it to a watchlist first to see detailed analysis.
        </p>
      </div>
    );
  }

  // ── Merge data sources ─────────────────────────────────
  const llm = detail.llm || supabaseLlm || {};
  const thoughts = thoughtsData?.thoughts || supabaseLlm?.thoughts_json || null;
  const thoughtsGeneratedAt = thoughtsData?.generated_at || supabaseLlm?.thoughts_generated_at || null;
  const verdict = thoughts?.verdict;

  const description =
    detail.description || stockInfo?.description || llm.description || llm.llm_description || null;
  const isLongDesc = (description?.length || 0) > 200;

  const currentPrice = stockInfo?.current_price || detail.last_price;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chart", label: "Chart", icon: <LineChart className="w-3.5 h-3.5" /> },
    { id: "analysis", label: "FinVibe's Thoughts", icon: <Brain className="w-3.5 h-3.5" /> },
    { id: "options", label: "Options", icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: "quant", label: "Quant Models", icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: "news", label: "Sentiment & News", icon: <Newspaper className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      {/* ═══════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════ */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <Link href="/watchlist" className="text-muted-foreground hover:text-primary mt-1 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="flex-1 min-w-0">
            {/* Row 1: Ticker + name + badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-primary">{ticker}</h1>
              <span className="text-lg text-foreground/80 truncate">{detail.name}</span>
              {detail.moat_rating && detail.moat_rating !== "None" && (
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  detail.moat_rating === "Wide" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {detail.moat_rating} Moat
                </span>
              )}
              {!detail.moat_rating && llm.moat && llm.moat !== "None" && (
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  llm.moat === "Wide" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {llm.moat} Moat (AI)
                </span>
              )}
              {detail.asset_type && detail.asset_type !== "stock" && (
                <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded uppercase tracking-wider">
                  {detail.asset_type}
                </span>
              )}
              {(detail.sector || stockInfo?.sector) && (
                <span className="text-[10px] px-2 py-0.5 bg-muted rounded text-muted-foreground">
                  {detail.sector || stockInfo?.sector}
                </span>
              )}
            </div>

            {/* Row 2: Price + verdict */}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {currentPrice != null && currentPrice > 0 && (
                <span className="text-3xl font-bold font-mono">
                  ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}

              {/* Quarterly trend */}
              {detail.quarterly_trend && (
                <span className={`flex items-center gap-1 text-sm font-mono ${
                  detail.quarterly_trend === "up" ? "text-green-400" : detail.quarterly_trend === "down" ? "text-red-400" : "text-muted-foreground"
                }`}>
                  {detail.quarterly_trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span className="text-xs text-muted-foreground">Q</span>
                </span>
              )}

              {/* Verdict pill */}
              {verdict && (
                <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                  verdict === "buy" ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                  verdict === "avoid" ? "bg-red-500/15 text-red-400 border border-red-500/30" :
                  "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                }`}>
                  {verdict} · {thoughts?.conviction || "medium"}
                </span>
              )}

              {detail.enrichment_status === "pending" && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded animate-pulse">pending</span>
              )}
              {detail.enrichment_status === "processing" && (
                <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded animate-pulse">enriching</span>
              )}
            </div>

            {/* Row 3: Key numbers */}
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/30">
              {[
                { label: "Mkt Cap", value: stockInfo?.market_cap ? `$${(stockInfo.market_cap / 1e9).toFixed(1)}B` : null },
                { label: "P/E", value: stockInfo?.pe_ratio ? stockInfo.pe_ratio.toFixed(1) : null },
                {
                  label: "Intrinsic",
                  value: detail.intrinsic_value ? `$${detail.intrinsic_value.toFixed(2)}` : null,
                  sub: "DCF",
                },
                {
                  label: "Intrinsic",
                  value: (llm.intrinsic_value ?? llm.llm_intrinsic_value) != null
                    ? `$${Number(llm.intrinsic_value ?? llm.llm_intrinsic_value).toFixed(2)}` : null,
                  sub: "AI",
                  color: "text-blue-400",
                },
                {
                  label: "MoS",
                  value: detail.margin_of_safety != null
                    ? `${(detail.margin_of_safety * 100).toFixed(0)}%` : null,
                  color: detail.margin_of_safety != null
                    ? (detail.margin_of_safety > 0 ? "text-green-400" : "text-red-400") : undefined,
                },
                {
                  label: "MoS",
                  value: (llm.margin_of_safety ?? llm.llm_margin_of_safety) != null
                    ? `${(Number(llm.margin_of_safety ?? llm.llm_margin_of_safety) * 100).toFixed(0)}%` : null,
                  sub: "AI",
                  color: (llm.margin_of_safety ?? llm.llm_margin_of_safety) != null
                    ? (Number(llm.margin_of_safety ?? llm.llm_margin_of_safety) > 0 ? "text-green-400" : "text-red-400") : undefined,
                },
                {
                  label: "52W Range",
                  value: stockInfo?.fifty_two_week_low && stockInfo?.fifty_two_week_high
                    ? `$${stockInfo.fifty_two_week_low.toFixed(0)}–$${stockInfo.fifty_two_week_high.toFixed(0)}` : null,
                },
                { label: "Beta", value: stockInfo?.beta ? stockInfo.beta.toFixed(2) : null },
              ]
                .filter(({ value }) => value !== null)
                .map(({ label, value, sub, color }, i) => (
                  <div key={`${label}-${sub || i}`} className="text-center min-w-[60px]">
                    <div className="text-[10px] text-muted-foreground">
                      {label}{sub ? <span className="text-blue-400/60 ml-0.5">({sub})</span> : null}
                    </div>
                    <div className={`font-mono text-sm font-semibold ${color || "text-foreground"}`}>{value}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          DESCRIPTION
          ═══════════════════════════════════════════════════ */}
      {description && (
        <div className="card px-5 py-3">
          <p className={`text-sm text-muted-foreground leading-relaxed ${
            !descExpanded && isLongDesc ? "line-clamp-2" : ""
          }`}>
            {description}
          </p>
          {isLongDesc && (
            <button
              onClick={() => setDescExpanded(!descExpanded)}
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-1 transition-colors"
            >
              {descExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {descExpanded ? "Less" : "More"}
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          TABS
          ═══════════════════════════════════════════════════ */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-primary/20 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground/80 hover:bg-accent/50"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          TAB CONTENT
          ═══════════════════════════════════════════════════ */}

      {activeTab === "chart" && (
        <>
          <PriceChart ticker={ticker} />
          <TechnicalAnalysis ticker={ticker} />
        </>
      )}

      {activeTab === "analysis" && (
        <FinVibeThoughts
          ticker={ticker}
          thoughts={thoughts}
          generatedAt={thoughtsGeneratedAt}
          llmIntrinsicValue={
            llm.intrinsic_value ?? llm.llm_intrinsic_value ?? thoughtsData?.llm_intrinsic_value
          }
          llmMarginOfSafety={
            llm.margin_of_safety ?? llm.llm_margin_of_safety ?? thoughtsData?.llm_margin_of_safety
          }
        />
      )}

      {activeTab === "options" && (
        <OptionsStrategy
          ticker={ticker}
          currentPrice={currentPrice || 0}
          thoughts={thoughts}
          stockInfo={stockInfo}
        />
      )}

      {activeTab === "quant" && (
        <ModelCards ticker={ticker} />
      )}

      {activeTab === "news" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
          <SentimentPanel ticker={ticker} />
          <RealtimeNewsFeed tickers={[ticker]} />
        </div>
      )}
    </div>
  );
}
