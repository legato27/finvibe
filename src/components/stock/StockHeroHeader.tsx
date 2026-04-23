"use client";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";

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
  const llmData = llm || detail?.llm || {};

  const stats = [
    { label: "Mkt Cap", value: stockInfo?.market_cap ? `$${(stockInfo.market_cap / 1e9).toFixed(1)}B` : null },
    { label: "P/E", value: stockInfo?.pe_ratio ? stockInfo.pe_ratio.toFixed(1) : null },
    {
      label: "Intrinsic",
      value: detail?.intrinsic_value ? `$${detail.intrinsic_value.toFixed(2)}` : null,
      sub: "DCF",
    },
    {
      label: "Intrinsic",
      value: (llmData.intrinsic_value ?? llmData.llm_intrinsic_value) != null
        ? `$${Number(llmData.intrinsic_value ?? llmData.llm_intrinsic_value).toFixed(2)}` : null,
      sub: "AI",
      color: "text-blue-400",
    },
    {
      label: "MoS",
      value: detail?.margin_of_safety != null
        ? `${(detail.margin_of_safety * 100).toFixed(0)}%` : null,
      color: detail?.margin_of_safety != null
        ? (detail.margin_of_safety > 0 ? "text-green-400" : "text-red-400") : undefined,
    },
    {
      label: "MoS",
      value: (llmData.margin_of_safety ?? llmData.llm_margin_of_safety) != null
        ? `${(Number(llmData.margin_of_safety ?? llmData.llm_margin_of_safety) * 100).toFixed(0)}%` : null,
      sub: "AI",
      color: (llmData.margin_of_safety ?? llmData.llm_margin_of_safety) != null
        ? (Number(llmData.margin_of_safety ?? llmData.llm_margin_of_safety) > 0 ? "text-green-400" : "text-red-400") : undefined,
    },
    {
      label: "52W Range",
      value: stockInfo?.fifty_two_week_low && stockInfo?.fifty_two_week_high
        ? `$${stockInfo.fifty_two_week_low.toFixed(0)}–$${stockInfo.fifty_two_week_high.toFixed(0)}` : null,
    },
    { label: "Beta", value: stockInfo?.beta ? stockInfo.beta.toFixed(2) : null },
  ].filter(({ value }) => value !== null);

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        <Link href={backHref} className="text-muted-foreground hover:text-primary mt-1 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Row 1: Ticker + name + badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono text-primary">{ticker}</h1>
            <span className="text-lg text-foreground/80 truncate">{detail?.name || "—"}</span>
            {detail?.moat_rating && detail.moat_rating !== "None" && (
              <span className={`text-[10px] px-2 py-0.5 rounded ${
                detail.moat_rating === "Wide" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
              }`}>
                {detail.moat_rating} Moat
              </span>
            )}
            {!detail?.moat_rating && llmData.moat && llmData.moat !== "None" && (
              <span className={`text-[10px] px-2 py-0.5 rounded ${
                llmData.moat === "Wide" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
              }`}>
                {llmData.moat} Moat (AI)
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
                {detail.quarterly_trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-xs text-muted-foreground">Q</span>
              </span>
            )}

            {verdict && (
              <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                verdict === "buy" ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                verdict === "avoid" ? "bg-red-500/15 text-red-400 border border-red-500/30" :
                "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
              }`}>
                {verdict} · {conviction || "medium"}
              </span>
            )}

            {detail?.enrichment_status === "pending" && (
              <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded animate-pulse">pending</span>
            )}
            {detail?.enrichment_status === "processing" && (
              <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded animate-pulse">enriching</span>
            )}
          </div>

          {/* Row 3: Key numbers */}
          {stats.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/30">
              {stats.map(({ label, value, sub, color }, i) => (
                <div key={`${label}-${sub || i}`} className="text-center min-w-[60px]">
                  <div className="text-[10px] text-muted-foreground">
                    {label}{sub ? <span className="text-blue-400/60 ml-0.5">({sub})</span> : null}
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
