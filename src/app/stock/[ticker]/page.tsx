"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { stocksApi } from "@/lib/api";
import { verdictToAction, verdictConviction } from "@/lib/signals";
import {
  useCatalogStock, useLLMAnalysis, useUser, useWatchlistNamesForTicker, useHoldingsForTicker,
} from "@/lib/supabase/hooks";
import { PriceChart } from "@/components/stock/PriceChart";
import { PriceActionAnalysis } from "@/components/stock/PriceActionAnalysis";
import { SentimentPanel } from "@/components/stock/SentimentPanel";
import { FinVibeThoughts } from "@/components/stock/FinVibeThoughts";
import { DcfScenarios } from "@/components/stock/DcfScenarios";
import { ModelCards } from "@/components/stock/ModelCards";
import OptionsChainTab from "@/components/stock/OptionsChainTab";
import { StockHeroHeader } from "@/components/stock/StockHeroHeader";
import { StockEvents } from "@/components/stock/StockEvents";
import { PortfolioAnalysis } from "@/components/stock/PortfolioAnalysis";
import { TransactionHistory } from "@/components/stock/TransactionHistory";
import { OptionsStrategyRecommendation } from "@/components/stock/OptionsStrategyRecommendation";
import { YourExposure, type Position } from "@/components/stock/YourExposure";
import { SectionNav } from "@/components/stock/SectionNav";
import { IndexNote, isIndexTicker } from "@/components/stock/IndexNote";
import { isCryptoTicker } from "@/modules/crypto/flag";
import { CryptoStockSections } from "@/modules/crypto/components/CryptoSurfaces";
import VerdictCard from "@/components/ui/VerdictCard";
import Panel, { PanelUnavailable } from "@/components/ui/Panel";
import Disclosure from "@/components/ui/Disclosure";
import { RealtimeNewsFeed } from "@/components/shared/RealtimeNewsFeed";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

// Old `?tab=` links land on the matching section.
const TAB_TO_SECTION: Record<string, string> = {
  chart: "chart", analysis: "thoughts", options: "options", quant: "models", news: "sentiment",
};

/**
 * One stock page. Left column is the argument: chart and levels, why the
 * system ranks it here, the thoughts, then the heavy sections collapsed.
 * Right column is you and the world: your exposure, dated events, the news.
 * When the ticker is held, the position sections appear in the left column
 * under the thoughts; nothing on the old portfolio page is lost.
 */
export default function StockDetailPage() {
  const t = useTranslations("stock");
  const params = useParams();
  const searchParams = useSearchParams();
  const ticker = (params.ticker as string)?.toUpperCase();
  const [descExpanded, setDescExpanded] = useState(false);
  const [generatingThoughts, setGeneratingThoughts] = useState(false);

  // Deep links: `#options` or the legacy `?tab=options` open that section.
  // The scroll waits for the page to have rendered (the spinner is gone).
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  useEffect(() => {
    const fromTab = TAB_TO_SECTION[searchParams.get("tab") ?? ""];
    const fromHash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    const target = fromHash || fromTab;
    if (!target) return;
    setOpenSection(target);
    setScrollTarget(target);
  }, [searchParams]);

  // ── Market data ──────────────────────────────────────────
  const { data: liveDetail, isLoading: detailLoading, isError: detailFailed } = useQuery({
    queryKey: ["stock-detail", ticker],
    queryFn: () => stocksApi.detail(ticker),
    enabled: !!ticker,
    staleTime: 60_000,
  });
  // Supabase-native, always available. Only consulted when the detail call
  // fails outright — the proxy stages /detail, so this is the second line.
  const { data: catalog } = useCatalogStock(ticker);
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
  const { data: standaloneVerdict } = useQuery({
    queryKey: ["stock-verdict", ticker],
    queryFn: () => stocksApi.verdict(ticker),
    enabled: !!ticker && detailFailed,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const { data: priceAction } = useQuery({
    queryKey: ["price-action", ticker],
    queryFn: () => stocksApi.priceAction(ticker),
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
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

  // ── You: position across every portfolio, lists carrying the name ──
  const { data: user } = useUser();
  const { data: lots } = useHoldingsForTicker(user ? ticker : null);
  const { data: listNames = [] } = useWatchlistNamesForTicker(user ? ticker : null);
  const position = useMemo<Position | null>(() => {
    if (!lots?.length) return null;
    const totalShares = lots.reduce((s, h) => s + h.shares, 0);
    const avgCost = lots.reduce((s, h) => s + h.shares * h.cost_basis, 0) / totalShares;
    return { totalShares, avgCost, lotCount: lots.length, portfolioIds: [...new Set(lots.map((h) => h.portfolio_id))] };
  }, [lots]);

  useEffect(() => {
    if (!scrollTarget || detailLoading) return;
    const id = window.setTimeout(() => {
      document.getElementById(scrollTarget)?.scrollIntoView({ block: "start" });
      setScrollTarget(null);
    }, 400);
    return () => window.clearTimeout(id);
  }, [scrollTarget, detailLoading]);

  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-20" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  // A FAILED detail call falls through to the catalog row; a genuinely
  // absent name gets the not-found card. The two used to be conflated.
  const detail =
    liveDetail ??
    (detailFailed && catalog
      ? {
          ticker, name: catalog.name, sector: catalog.sector, industry: catalog.industry,
          last_price: catalog.last_price, intrinsic_value: catalog.intrinsic_value,
          margin_of_safety: catalog.margin_of_safety, moat_rating: catalog.moat_rating,
          verdict: standaloneVerdict ?? null, description: null, dcf_detail: null, llm: null,
        }
      : null);

  if (!detail) {
    return (
      <div className="mx-auto max-w-[800px]">
        <PanelUnavailable
          label={ticker}
          reason={detailFailed ? t("unavailableBody") : t("notFoundBody")}
          aside={<Link href="/watchlist" className="text-signal hover:underline">{t("openWatchlist")}</Link>}
        />
        <p className="mt-3 text-center text-sm text-muted-foreground">{detailFailed ? t("unavailableTitle", { ticker }) : t("notFoundTitle", { ticker })}</p>
      </div>
    );
  }

  const llm = detail.llm || supabaseLlm || {};
  const thoughts = thoughtsData?.thoughts || supabaseLlm?.thoughts_json || null;
  const thoughtsGeneratedAt = thoughtsData?.generated_at || supabaseLlm?.thoughts_generated_at || null;
  const unifiedAction = detail.verdict?.state ? verdictToAction(detail.verdict.state) : undefined;
  const description = detail.description || stockInfo?.description || llm.description || llm.llm_description || null;
  const isLongDesc = (description?.length || 0) > 200;
  const currentPrice: number = stockInfo?.current_price || detail.last_price || 0;

  // An index has a chart and price action; the rest does not apply and is
  // said once, in one panel, rather than as six pending sections.
  const isIndex = isIndexTicker(ticker);
  // Crypto module: a coin keeps chart, verdict and sentiment; the module's
  // section replaces DCF, thoughts, options and models.
  const isCrypto = !isIndex && isCryptoTicker(ticker);
  const sections = isCrypto
    ? [
        { id: "chart", label: t("sectionChart") },
        { id: "why", label: t("sectionWhy") },
        { id: "crypto", label: t("sectionCrypto") },
        ...(position ? [{ id: "position", label: t("sectionPosition") }] : []),
        { id: "sentiment", label: t("sectionSentiment") },
      ]
    : isIndex
    ? [
        { id: "chart", label: t("sectionChart") },
        { id: "why", label: t("sectionWhy") },
      ]
    : [
        { id: "chart", label: t("sectionChart") },
        { id: "why", label: t("sectionWhy") },
        { id: "thoughts", label: t("sectionThoughts") },
        ...(position ? [{ id: "position", label: t("sectionPosition") }] : []),
        { id: "options", label: t("sectionOptions") },
        { id: "models", label: t("sectionModels") },
        { id: "sentiment", label: t("sectionSentiment") },
      ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <StockHeroHeader
        ticker={ticker}
        backHref={position ? "/portfolio" : "/watchlist"}
        detail={detail}
        stockInfo={stockInfo}
        currentPrice={currentPrice}
        verdict={isIndex ? undefined : (unifiedAction ?? thoughts?.verdict)}
        conviction={isIndex ? undefined : detail.verdict?.state ? verdictConviction(detail.verdict.state, detail.verdict.confidence) : thoughts?.conviction}
        llm={llm}
      />

      <SectionNav sections={sections} ariaLabel={t("sectionsLabel")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* ── Left: the argument ── */}
        <div className="min-w-0 space-y-4">
          <section id="chart" className="scroll-mt-24 space-y-4">
            <PriceChart ticker={ticker} priceAction={priceAction} currentPrice={currentPrice} />
            <PriceActionAnalysis ticker={ticker} />
          </section>

          <section id="why" className="scroll-mt-24 space-y-4">
            {isIndex ? <IndexNote ticker={ticker} /> : <VerdictCard verdict={detail.verdict} />}
            {description && (
              <Panel label={t("about")} as="div">
                <p className={`text-sm leading-relaxed text-muted-foreground ${!descExpanded && isLongDesc ? "line-clamp-2" : ""}`}>{description}</p>
                {isLongDesc && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded(!descExpanded)}
                    aria-expanded={descExpanded}
                    className="mt-1 flex items-center gap-1 text-xs text-signal hover:underline"
                  >
                    {descExpanded ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                    {descExpanded ? t("less") : t("more")}
                  </button>
                )}
              </Panel>
            )}
          </section>

          {isCrypto && <CryptoStockSections ticker={ticker} />}
          {!isIndex && !isCrypto && (
          <section id="thoughts" className="scroll-mt-24 space-y-4">
            <DcfScenarios dcf={detail.dcf_detail} />
            <FinVibeThoughts
              ticker={ticker}
              thoughts={thoughts}
              generatedAt={thoughtsGeneratedAt}
              quantUpdatedAt={detail.quant_updated_at ?? null}
              isGenerating={generatingThoughts && !thoughts}
              onGenerate={() => setGeneratingThoughts(true)}
              onGenerateDone={() => setGeneratingThoughts(false)}
              llmIntrinsicValue={llm.intrinsic_value ?? llm.llm_intrinsic_value ?? thoughtsData?.llm_intrinsic_value}
              llmMarginOfSafety={llm.margin_of_safety ?? llm.llm_margin_of_safety ?? thoughtsData?.llm_margin_of_safety}
            />
          </section>
          )}

          {/* ── Held only: what to do with the position ── */}
          {position && currentPrice > 0 && (
            <section id="position" className="scroll-mt-24 space-y-4">
              <Disclosure label={t("positionAdvice")} open={openSection === "position" || openSection == null}>
                <PortfolioAnalysis
                  ticker={ticker}
                  currentPrice={currentPrice}
                  position={{ shares: position.totalShares, avgCost: position.avgCost }}
                  stockInfo={stockInfo}
                  thoughts={thoughts}
                  verdictAction={unifiedAction}
                  thoughtsGeneratedAt={thoughtsGeneratedAt}
                  quantUpdatedAt={detail.quant_updated_at ?? null}
                  thoughtsData={thoughtsData}
                  isGenerating={generatingThoughts && !thoughts}
                  onGenerate={() => setGeneratingThoughts(true)}
                  onGenerateDone={() => setGeneratingThoughts(false)}
                />
              </Disclosure>
              <Disclosure label={t("positionOptions")}>
                <OptionsStrategyRecommendation
                  ticker={ticker}
                  currentPrice={currentPrice}
                  stockInfo={stockInfo}
                  thoughts={thoughts}
                  verdictAction={unifiedAction}
                  position={{ shares: position.totalShares, avgCost: position.avgCost }}
                />
              </Disclosure>
              <Disclosure label={t("transactions")} qualifier={t("lots", { count: position.lotCount })}>
                <TransactionHistory ticker={ticker} portfolioId={position.portfolioIds[0]} lots={lots ?? []} />
              </Disclosure>
            </section>
          )}

          {!isIndex && !isCrypto && (
            <>
              <Disclosure id="options" label={t("sectionOptions")} qualifier={t("chainQualifier")} open={openSection === "options"}>
                <OptionsChainTab ticker={ticker} />
              </Disclosure>

              <Disclosure id="models" label={t("sectionModels")} qualifier={t("modelsQualifier")} open={openSection === "models"}>
                <ModelCards ticker={ticker} />
              </Disclosure>
            </>
          )}
          {!isIndex && (
            <section id="sentiment" className="scroll-mt-24">
              <SentimentPanel ticker={ticker} />
            </section>
          )}
        </div>

        {/* ── Right: you and the world ── */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[104px]">
          {isIndex ? (
            <IndexNote ticker={ticker} variant="aside" />
          ) : (
            <>
              <YourExposure ticker={ticker} signedIn={!!user} position={position} currentPrice={currentPrice} listNames={listNames} />
              <StockEvents ticker={ticker} />
            </>
          )}
          <RealtimeNewsFeed tickers={[ticker]} />
          <Panel label={t("viaMcp")} reading={t("viaMcpNote")} as="div">
            <code className="block whitespace-pre-wrap font-mono text-[11.5px] text-muted-foreground">
              get_stock_verdict {"{"} ticker: &quot;{ticker}&quot; {"}"}{"\n"}get_stock_info {"{"} ticker: &quot;{ticker}&quot; {"}"}
            </code>
            <Link href="/mcp" className="mt-2 inline-flex text-xs text-signal hover:underline">{t("viaMcpLink")} →</Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
