"use client";
import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stocksApi, sentimentApi } from "@/lib/api";
import { verdictToAction, verdictConviction } from "@/lib/signals";
import { useLLMAnalysis } from "@/lib/supabase/hooks";
import { PriceChart } from "@/components/stock/PriceChart";
import { PriceActionAnalysis } from "@/components/stock/PriceActionAnalysis";
import { SentimentPanel } from "@/components/stock/SentimentPanel";
import { FinVibeThoughts } from "@/components/stock/FinVibeThoughts";
import { DcfScenarios } from "@/components/stock/DcfScenarios";
import { ModelCards } from "@/components/stock/ModelCards";
import OptionsChainTab from "@/components/stock/OptionsChainTab";
import { StockHeroHeader } from "@/components/stock/StockHeroHeader";
import VerdictCard from "@/components/ui/VerdictCard";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import { OsintFeed } from "@/components/shared/OsintFeed";
import {
  Brain, Loader2,
  ChevronDown, ChevronUp, LineChart, Newspaper, Cpu, DollarSign,
} from "lucide-react";

type Tab = "chart" | "analysis" | "options" | "quant" | "news";

export default function StockDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const ticker = (params.ticker as string)?.toUpperCase();
  const [descExpanded, setDescExpanded] = useState(false);
  const initialTab = (["chart", "analysis", "options", "quant", "news"] as Tab[]).includes(
    searchParams.get("tab") as Tab,
  )
    ? (searchParams.get("tab") as Tab)
    : "chart";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

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

  const [generatingThoughts, setGeneratingThoughts] = useState(false);
  const { data: thoughtsData } = useQuery({
    queryKey: ["stock-thoughts", ticker],
    queryFn: () => stocksApi.thoughts(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
    retry: false,
    // Poll every 8s while generating until thoughts arrive
    refetchInterval: generatingThoughts ? 8_000 : false,
  });

  const { data: supabaseLlm } = useLLMAnalysis(ticker);

  // Price Action (PAM) — shared by the chart overlays and the analysis panel
  // (same queryKey → react-query dedupes to a single request)
  const { data: priceAction } = useQuery({
    queryKey: ["price-action", ticker],
    queryFn: () => stocksApi.priceAction(ticker),
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
  });

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
      <StockHeroHeader
        ticker={ticker}
        backHref="/watchlist"
        detail={detail}
        stockInfo={stockInfo}
        currentPrice={currentPrice}
        verdict={detail.verdict?.state ? verdictToAction(detail.verdict.state) : thoughts?.verdict}
        conviction={detail.verdict?.state ? verdictConviction(detail.verdict.state, detail.verdict.confidence) : thoughts?.conviction}
        llm={llm}
      />

      {/* ═══════════════════════════════════════════════════
          UNIFIED VERDICT — the one arbitrated signal, with evidence
          ═══════════════════════════════════════════════════ */}
      <VerdictCard verdict={detail.verdict} />

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
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 transition-colors"
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
      <div role="tablist" aria-label="Stock analysis sections"
           className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={activeTab === tab.id ? `tabpanel-${tab.id}` : undefined}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-mono text-sm font-semibold transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-primary/15 text-primary border border-primary/40"
                : "text-muted-foreground hover:text-foreground/80 hover:bg-accent/50 border border-transparent"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sr-only sm:hidden">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          TAB CONTENT
          ═══════════════════════════════════════════════════ */}

      {activeTab === "chart" && (
        <div role="tabpanel" id="tabpanel-chart" className="space-y-4">
          <PriceChart ticker={ticker} priceAction={priceAction} currentPrice={currentPrice} />
          <PriceActionAnalysis ticker={ticker} />
        </div>
      )}

      {activeTab === "analysis" && (
        <div role="tabpanel" id="tabpanel-analysis" className="space-y-4">
          <DcfScenarios dcf={detail.dcf_detail} />
          <FinVibeThoughts
            ticker={ticker}
            thoughts={thoughts}
            generatedAt={thoughtsGeneratedAt}
            isGenerating={generatingThoughts && !thoughts}
            onGenerate={() => setGeneratingThoughts(true)}
            onGenerateDone={() => setGeneratingThoughts(false)}
            llmIntrinsicValue={
              llm.intrinsic_value ?? llm.llm_intrinsic_value ?? thoughtsData?.llm_intrinsic_value
            }
            llmMarginOfSafety={
              llm.margin_of_safety ?? llm.llm_margin_of_safety ?? thoughtsData?.llm_margin_of_safety
            }
          />
        </div>
      )}

      {activeTab === "options" && (
        <div role="tabpanel" id="tabpanel-options">
          <OptionsChainTab ticker={ticker} />
        </div>
      )}

      {activeTab === "quant" && (
        <div role="tabpanel" id="tabpanel-quant">
          <ModelCards ticker={ticker} />
        </div>
      )}

      {activeTab === "news" && (
        <div role="tabpanel" id="tabpanel-news" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
            <SentimentPanel ticker={ticker} />
            <RealtimeNewsFeed tickers={[ticker]} />
          </div>
          <OsintFeed ticker={ticker} />
        </div>
      )}
    </div>
  );
}
