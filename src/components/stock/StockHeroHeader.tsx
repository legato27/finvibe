"use client";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatMoS } from "@/lib/valuation";

interface Props {
  ticker: string;
  backHref: string;
  detail: any;
  stockInfo: any;
  currentPrice: number | null;
  verdict?: string | null;
  conviction?: string | null;
  llm?: any;
}

export function StockHeroHeader({
  ticker, backHref, detail, stockInfo, currentPrice, verdict, conviction, llm,
}: Props) {
  const t = useTranslations('stock');
  const llmData = llm || detail?.llm || {};

  const stats = [
    { label: t('mktCap'), value: stockInfo?.market_cap ? `$${(stockInfo.market_cap / 1e9).toFixed(1)}B` : null },
    { label: t('pe'), value: stockInfo?.pe_ratio ? stockInfo.pe_ratio.toFixed(1) : null },
    {
      label: t('intrinsic'),
      value: detail?.intrinsic_value ? `$${detail.intrinsic_value.toFixed(2)}` : null,
      sub: t('dcf'),
    },
    {
      label: t('intrinsic'),
      value: (llmData.intrinsic_value ?? llmData.llm_intrinsic_value) != null
        ? `$${Number(llmData.intrinsic_value ?? llmData.llm_intrinsic_value).toFixed(2)}` : null,
      sub: t('ai'),
      color: "text-sky-700 dark:text-sky-400",
    },
    {
      label: t('mos'),
      value: formatMoS(detail?.margin_of_safety),
      sub: t('dcf'),
      color: detail?.margin_of_safety != null
        ? (detail.margin_of_safety > 0 ? "text-signal-long" : "text-signal-short") : undefined,
    },
    {
      label: t('mos'),
      value: formatMoS(llmData.margin_of_safety ?? llmData.llm_margin_of_safety),
      sub: t('ai'),
      color: (llmData.margin_of_safety ?? llmData.llm_margin_of_safety) != null
        ? (Number(llmData.margin_of_safety ?? llmData.llm_margin_of_safety) > 0 ? "text-signal-long" : "text-signal-short") : undefined,
    },
    {
      label: t('fiftyTwoWeekRangeShort'),
      value: stockInfo?.fifty_two_week_low && stockInfo?.fifty_two_week_high
        ? `$${stockInfo.fifty_two_week_low.toFixed(0)}–$${stockInfo.fifty_two_week_high.toFixed(0)}` : null,
    },
    { label: t('betaShort'), value: stockInfo?.beta ? stockInfo.beta.toFixed(2) : null },
  ].filter(({ value }) => value !== null);

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        <Link href={backHref} aria-label="Back to watchlist"
              className="text-muted-foreground hover:text-primary mt-1 transition-colors">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Row 1: Ticker + name + badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono text-primary">{ticker}</h1>
            <span className="text-lg text-foreground/80 truncate">{detail?.name || "—"}</span>
            {detail?.moat_rating && detail.moat_rating !== "None" && (
              <span className={`text-[10px] px-2 py-0.5 rounded ${
                detail.moat_rating === "Wide" ? "bg-signal-long-bg text-signal-long border border-signal-long/40" : "bg-signal-caution-bg text-signal-caution border border-signal-caution/40"
              }`}>
                {t('moatLabel', { rating: detail.moat_rating })}
              </span>
            )}
            {!detail?.moat_rating && llmData.moat && llmData.moat !== "None" && (
              <span className={`text-[10px] px-2 py-0.5 rounded ${
                llmData.moat === "Wide" ? "bg-signal-long-bg text-signal-long border border-signal-long/40" : "bg-signal-caution-bg text-signal-caution border border-signal-caution/40"
              }`}>
                {t('moatLabelAi', { rating: llmData.moat })}
              </span>
            )}
            {detail?.asset_type && detail.asset_type !== "stock" && (
              <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded uppercase tracking-wider">
                {detail.asset_type}
              </span>
            )}
            {(detail?.sector || stockInfo?.sector) && (
              <span className="text-[10px] px-2 py-0.5 bg-muted rounded text-muted-foreground">
                {detail?.sector || stockInfo?.sector}
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

            {detail?.quarterly_trend && (
              <span className={`flex items-center gap-1 text-sm font-mono ${
                detail.quarterly_trend === "up" ? "text-green-400" : detail.quarterly_trend === "down" ? "text-red-400" : "text-muted-foreground"
              }`}>
                {detail.quarterly_trend === "up" ? <TrendingUp className="w-4 h-4" /> : detail.quarterly_trend === "down" ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                <span className="text-xs text-muted-foreground">{t('quarterlyShort')}</span>
              </span>
            )}

            {verdict && (
              <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                verdict === "buy" ? "bg-signal-long-bg text-signal-long border border-signal-long/40" :
                verdict === "avoid" ? "bg-signal-short-bg text-signal-short border border-signal-short/40" :
                "bg-signal-caution-bg text-signal-caution border border-signal-caution/40"
              }`}>
                {verdict} · {conviction || t('convictionMedium')}
              </span>
            )}

            {detail?.enrichment_status === "pending" && (
              <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-signal-caution rounded animate-pulse">{t('statusPending')}</span>
            )}
            {detail?.enrichment_status === "processing" && (
              <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-sky-700 dark:text-sky-400 rounded animate-pulse">{t('statusEnriching')}</span>
            )}
          </div>

          {/* Row 3: Key numbers */}
          {stats.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/30">
              {stats.map(({ label, value, sub, color }, i) => (
                <div key={`${label}-${sub || i}`} className="text-center min-w-[60px]">
                  <div className="text-[10px] text-muted-foreground">
                    {label}{sub ? <span className="text-sky-700 dark:text-sky-400 ml-0.5">({sub})</span> : null}
                  </div>
                  <div className={`font-mono text-sm font-semibold ${color || "text-foreground"}`}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
