"use client";
import { useTranslations } from "next-intl";
import { formatMoS } from "@/lib/valuation";

interface StockMetricsProps {
  sector?: string | null;
  industry?: string | null;
  llmSector?: string | null;
  isEtf?: boolean;
  moatRating?: string | null;
  moatConfidence?: number | null;
  llmMoat?: string | null;
  intrinsicValue?: number | null;
  marginOfSafety?: number | null;
  llmIntrinsicValue?: number | null;
  llmMarginOfSafety?: number | null;
  wacc?: number | null;
  lastPrice?: number | null;
  tenYrLow?: number | null;
  tenYrHigh?: number | null;
}

function MetricCard({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="bg-white/[0.02] border border-border/30 rounded-lg p-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-mono font-semibold ${color || "text-slate-200"}`}>{value}</div>
      {subValue && <div className="text-[10px] text-slate-500 mt-0.5">{subValue}</div>}
    </div>
  );
}

export function StockMetrics({
  sector,
  industry,
  llmSector,
  isEtf,
  moatRating,
  moatConfidence,
  llmMoat,
  intrinsicValue,
  marginOfSafety,
  llmIntrinsicValue,
  llmMarginOfSafety,
  wacc,
  lastPrice,
  tenYrLow,
  tenYrHigh,
}: StockMetricsProps) {
  const t = useTranslations('stock');
  // Sector display logic
  const displaySector = isEtf ? null : sector && sector !== "-" ? sector : llmSector;
  const isSectorAi = !sector || sector === "-" || !sector.trim();

  // Moat display logic
  const displayMoat = moatRating || llmMoat;
  const isMoatAi = !moatRating && !!llmMoat;

  // Price range bar
  const rangePercent =
    tenYrLow != null && tenYrHigh != null && lastPrice != null && tenYrHigh > tenYrLow
      ? ((lastPrice - tenYrLow) / (tenYrHigh - tenYrLow)) * 100
      : null;

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-3">{t('keyMetrics')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {displaySector && (
          <MetricCard
            label={isSectorAi ? t('sectorAi') : t('sector')}
            value={displaySector}
            subValue={industry || undefined}
          />
        )}

        {displayMoat && displayMoat !== "None" && (
          <MetricCard
            label={isMoatAi ? t('moatAi') : t('moat')}
            value={displayMoat}
            subValue={
              moatConfidence != null
                ? t('moatConfidence', { pct: (moatConfidence * 100).toFixed(0) })
                : undefined
            }
            color={displayMoat === "Wide" ? "text-signal-long" : "text-signal-caution"}
          />
        )}

        {intrinsicValue != null && (
          <MetricCard
            label={t('intrinsicValueDcf')}
            value={`$${intrinsicValue.toFixed(2)}`}
            subValue={wacc != null ? t('waccLabel', { pct: (wacc * 100).toFixed(1) }) : undefined}
          />
        )}

        {llmIntrinsicValue != null && (
          <MetricCard
            label={t('intrinsicValueAi')}
            value={`$${llmIntrinsicValue.toFixed(2)}`}
            color="text-blue-400"
          />
        )}

        {marginOfSafety != null && (
          <MetricCard
            label={t('marginOfSafetyDcf')}
            value={formatMoS(marginOfSafety) ?? "—"}
            color={marginOfSafety > 0 ? "text-signal-long" : "text-signal-short"}
          />
        )}

        {llmMarginOfSafety != null && (
          <MetricCard
            label={t('marginOfSafetyAi')}
            value={formatMoS(llmMarginOfSafety) ?? "—"}
            color={llmMarginOfSafety > 0 ? "text-signal-long" : "text-signal-short"}
          />
        )}
      </div>

      {/* 10-Year Price Range Bar */}
      {rangePercent != null && tenYrLow != null && tenYrHigh != null && (
        <div className="mt-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            {t('tenYearPriceRange')}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="font-mono">${tenYrLow.toFixed(2)}</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full relative overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full opacity-30"
                style={{ width: "100%" }}
              />
              <div
                className="absolute top-0 h-full w-1.5 bg-primary rounded-full"
                style={{ left: `${Math.min(Math.max(rangePercent, 0), 100)}%` }}
              />
            </div>
            <span className="font-mono">${tenYrHigh.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
