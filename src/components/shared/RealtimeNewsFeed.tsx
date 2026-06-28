"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { sentimentApi } from "@/lib/api";
import { ExternalLink, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsItem {
  source: string;
  ticker?: string;
  headline: string;
  url?: string;
  score: number;
  published_at?: string;
  sentiment_label: string;
  sentiment_reasoning?: string;
}

function SentimentIcon({ label }: { label: string }) {
  if (label === "Bullish") return <TrendingUp className="w-3 h-3 text-success" />;
  if (label === "Bearish") return <TrendingDown className="w-3 h-3 text-danger" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function scoreToClass(score: number) {
  if (score > 0.1) return "border-success/50 bg-success/20";
  if (score < -0.1) return "border-danger/50 bg-danger/20";
  return "border-border/50";
}

// Left-border + text tint for the per-ticker "why" line (Polygon reasoning),
// keyed to the sentiment sign so the rationale reads in the label's color.
function reasoningToClass(score: number) {
  if (score > 0.1) return "border-success text-success/80";
  if (score < -0.1) return "border-danger text-danger/80";
  return "border-border text-muted-foreground";
}

export function RealtimeNewsFeed({ tickers }: { tickers?: string[] }) {
  const t = useTranslations("news");
  const { data: feed = [], isLoading } = useQuery({
    queryKey: ["news_feed", tickers?.join(",")],
    queryFn: () => sentimentApi.newsFeed(60, tickers),
    refetchInterval: 5 * 60 * 1000,  // 5 minutes
    staleTime: 4 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">{t("newsAndSentiment")}</span>
        </div>
        <div className="text-muted-foreground text-sm animate-pulse py-4 text-center">{t("loadingFeed")}</div>
      </div>
    );
  }

  return (
    <div className="card h-full">
      <div className="card-header">
        <span className="card-title">{t("newsAndSentiment")}</span>
        <span className="text-xs text-muted-foreground">{t("articlesCount", { count: feed.length })}</span>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {feed.length === 0 && (
          <div className="text-muted-foreground text-sm py-4 text-center">
            {tickers && tickers.length > 0
              ? t("noNewsForTickers", { tickers: tickers.join(", ") })
              : t("noNewsYet")}
          </div>
        )}
        {feed.map((item: NewsItem, idx: number) => (
          <div
            key={idx}
            className={`flex items-start gap-2 p-2 rounded-lg border ${scoreToClass(item.score)} hover:bg-white/5 transition-colors`}
          >
            <div className="flex-shrink-0 mt-0.5">
              <SentimentIcon label={item.sentiment_label} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {item.ticker && (
                  <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded font-mono font-bold">
                    {item.ticker}
                  </span>
                )}
                <span className="text-xs text-muted-foreground truncate">{item.source}</span>
                {item.published_at && (
                  <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                    {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-1">
                <p className="text-xs text-foreground leading-relaxed line-clamp-2 flex-1">
                  {item.headline}
                </p>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {item.sentiment_reasoning && (
                <p
                  className={`text-[11px] italic leading-snug mt-1 pl-1.5 border-l-2 line-clamp-3 ${reasoningToClass(item.score)}`}
                >
                  {item.sentiment_reasoning}
                </p>
              )}
            </div>

            <div
              className={`flex-shrink-0 text-xs font-mono font-bold ${
                item.score > 0.1 ? "text-success" : item.score < -0.1 ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {item.score >= 0 ? "+" : ""}{(item.score * 100).toFixed(0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
