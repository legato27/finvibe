"use client";
import { TrendingUp, TrendingDown, Minus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface StockHeaderProps {
  ticker: string;
  name?: string | null;
  lastPrice?: number | null;
  assetType?: string;
  moatRating?: string | null;
  llmMoat?: string | null;
  enrichmentStatus?: string;
  quarterlyTrend?: string | null;
  yearlyTrend?: string | null;
}

export function StockHeader({
  ticker,
  name,
  lastPrice,
  assetType,
  moatRating,
  llmMoat,
  enrichmentStatus,
  quarterlyTrend,
  yearlyTrend,
}: StockHeaderProps) {
  const t = useTranslations('stock');
  const displayMoat = moatRating || llmMoat;
  const isAiMoat = !moatRating && !!llmMoat;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/watchlist"
            className="mt-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono text-primary">{ticker}</h1>
              {assetType && assetType !== "stock" && (
                <span className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded uppercase tracking-wider">
                  {assetType}
                </span>
              )}
              {displayMoat && displayMoat !== "None" && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    displayMoat === "Wide"
                      ? "bg-signal-long-bg text-signal-long border border-signal-long/40"
                      : "bg-signal-caution-bg text-signal-caution border border-signal-caution/40"
                  }`}
                >
                  {isAiMoat
                    ? t('moatLabelAi', { rating: displayMoat })
                    : t('moatLabel', { rating: displayMoat })}
                </span>
              )}
              {enrichmentStatus === "pending" && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded animate-pulse">
                  {t('statusPending')}
                </span>
              )}
              {enrichmentStatus === "processing" && (
                <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded animate-pulse">
                  {t('statusEnriching')}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-0.5">{name || ticker}</p>
          </div>
        </div>

        <div className="text-right">
          {lastPrice != null && lastPrice > 0 && (
            <div className="text-2xl font-mono font-bold text-slate-200">
              ${lastPrice.toFixed(2)}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1 justify-end">
            {quarterlyTrend && (
              <span
                className={`text-xs flex items-center gap-0.5 ${
                  quarterlyTrend === "up"
                    ? "text-signal-long"
                    : quarterlyTrend === "down"
                    ? "text-signal-short"
                    : "text-muted-foreground"
                }`}
              >
                {quarterlyTrend === "up" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : quarterlyTrend === "down" ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {t('quarterly')}
              </span>
            )}
            {yearlyTrend && (
              <span
                className={`text-xs flex items-center gap-0.5 ${
                  yearlyTrend === "up"
                    ? "text-signal-long"
                    : yearlyTrend === "down"
                    ? "text-signal-short"
                    : "text-muted-foreground"
                }`}
              >
                {yearlyTrend === "up" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : yearlyTrend === "down" ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {t('yearly')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
