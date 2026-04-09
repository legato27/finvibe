"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import { useLLMAnalysis } from "@/lib/supabase/hooks";
import { StockHeader } from "@/components/stock/StockHeader";
import { StockMetrics } from "@/components/stock/StockMetrics";
import { FinVibeThoughts } from "@/components/stock/FinVibeThoughts";
import { Brain } from "lucide-react";

export default function StockDetailPage() {
  const params = useParams();
  const ticker = (params.ticker as string)?.toUpperCase();

  // Fetch stock detail from DGX backend
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["stock-detail", ticker],
    queryFn: () => stocksApi.detail(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
  });

  // Fetch FinVibe's Thoughts from DGX backend
  const { data: thoughtsData } = useQuery({
    queryKey: ["stock-thoughts", ticker],
    queryFn: () => stocksApi.thoughts(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
    retry: false, // 404 is expected if no thoughts yet
  });

  // Fetch LLM analysis from Supabase (fallback for public users)
  const { data: supabaseLlm } = useLLMAnalysis(ticker);

  // Fetch stock info (for description fallback)
  const { data: stockInfo } = useQuery({
    queryKey: ["stock-info", ticker],
    queryFn: () => stocksApi.info(ticker),
    enabled: !!ticker,
    staleTime: 300_000,
  });

  if (detailLoading) {
    return (
      <div className="space-y-4">
        <div className="card p-5 animate-pulse">
          <div className="h-8 w-48 bg-slate-800 rounded mb-2" />
          <div className="h-4 w-32 bg-slate-800 rounded" />
        </div>
        <div className="card p-5 animate-pulse">
          <div className="h-4 w-24 bg-slate-800 rounded mb-3" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-16 bg-slate-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="card p-12 text-center text-slate-500">
        <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Stock {ticker} not found in watchlist.</p>
        <p className="text-xs text-slate-600 mt-1">
          Add it to a watchlist first to see detailed analysis.
        </p>
      </div>
    );
  }

  // Merge data sources for LLM fields
  const llm = detail.llm || supabaseLlm || {};
  const thoughts = thoughtsData?.thoughts || supabaseLlm?.thoughts_json || null;
  const thoughtsGeneratedAt =
    thoughtsData?.generated_at || supabaseLlm?.thoughts_generated_at || null;

  // Description: backend detail > stock info > LLM description
  const description =
    detail.description ||
    stockInfo?.description ||
    llm.description ||
    llm.llm_description ||
    null;

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      {/* Header */}
      <StockHeader
        ticker={detail.ticker}
        name={detail.name}
        lastPrice={detail.last_price}
        assetType={detail.asset_type}
        moatRating={detail.moat_rating}
        llmMoat={llm.moat || llm.llm_moat}
        enrichmentStatus={detail.enrichment_status}
        quarterlyTrend={detail.quarterly_trend}
        yearlyTrend={detail.yearly_trend}
      />

      {/* Description */}
      {description && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">About</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      )}

      {/* Key Metrics */}
      <StockMetrics
        sector={detail.sector}
        industry={detail.industry}
        llmSector={llm.sector || llm.llm_sector}
        isEtf={detail.is_etf}
        moatRating={detail.moat_rating}
        moatConfidence={detail.moat_confidence}
        llmMoat={llm.moat || llm.llm_moat}
        intrinsicValue={detail.intrinsic_value}
        marginOfSafety={detail.margin_of_safety}
        llmIntrinsicValue={
          llm.intrinsic_value ?? llm.llm_intrinsic_value ?? thoughtsData?.llm_intrinsic_value
        }
        llmMarginOfSafety={
          llm.margin_of_safety ?? llm.llm_margin_of_safety ?? thoughtsData?.llm_margin_of_safety
        }
        wacc={detail.wacc}
        lastPrice={detail.last_price}
        tenYrLow={detail.ten_yr_low}
        tenYrHigh={detail.ten_yr_high}
      />

      {/* FinVibe's Thoughts */}
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
    </div>
  );
}
