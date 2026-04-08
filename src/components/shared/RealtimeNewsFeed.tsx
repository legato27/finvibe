"use client";
import { useQuery } from "@tanstack/react-query";
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
}

function SentimentIcon({ label }: { label: string }) {
  if (label === "Bullish") return <TrendingUp className="w-3 h-3 text-green-500" />;
  if (label === "Bearish") return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-slate-500" />;
}

function scoreToClass(score: number) {
  if (score > 0.1) return "border-green-900/50 bg-green-950/20";
  if (score < -0.1) return "border-red-900/50 bg-red-950/20";
  return "border-border/50";
}

export function RealtimeNewsFeed({ tickers }: { tickers?: string[] }) {
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
          <span className="card-title">News & Sentiment</span>
        </div>
        <div className="text-slate-500 text-sm animate-pulse py-4 text-center">Loading news feed...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">News & Sentiment</span>
        <span className="text-xs text-slate-500">{feed.length} articles · FinBERT scored</span>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {feed.length === 0 && (
          <div className="text-slate-500 text-sm py-4 text-center">
            {tickers && tickers.length > 0
              ? `No news found for ${tickers.join(", ")} — articles appear as they are published`
              : "No news available yet — crawler runs every 5 minutes"}
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
                <span className="text-xs text-slate-500 truncate">{item.source}</span>
                {item.published_at && (
                  <span className="text-xs text-slate-600 ml-auto flex-shrink-0">
                    {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-1">
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 flex-1">
                  {item.headline}
                </p>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-slate-600 hover:text-primary"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <div
              className={`flex-shrink-0 text-xs font-mono font-bold ${
                item.score > 0.1 ? "text-green-500" : item.score < -0.1 ? "text-red-500" : "text-slate-600"
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
