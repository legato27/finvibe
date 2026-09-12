"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { sentimentApi } from "@/lib/api";
import { NEUTRAL_BAND } from "@/lib/signals";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { usePalette } from "@/components/heatmap/palette";

interface Props { ticker: string }

/** Composite score → tone. The key indexes the runtime palette for chart
 *  fills; the class is the same tone as text. */
type SentimentTone = "long" | "long-strong" | "neutral" | "short" | "break";
const TONE_TEXT: Record<SentimentTone, string> = {
  long: "text-signal-long",
  "long-strong": "text-signal-long-strong",
  neutral: "text-signal-neutral",
  short: "text-signal-short",
  break: "text-signal-break",
};

function sentimentTone(score: number): SentimentTone {
  if (score > 0.3) return "long";
  if (score > NEUTRAL_BAND.sentimentScore) return "long-strong";
  if (score > -NEUTRAL_BAND.sentimentScore) return "neutral";
  if (score > -0.3) return "short";
  return "break";
}

export function SentimentPanel({ ticker }: Props) {
  const t = useTranslations("sentiment");
  const pal = usePalette();
  const { data, isLoading } = useQuery({
    queryKey: ["sentiment", ticker],
    queryFn: () => sentimentApi.ticker(ticker),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="card animate-pulse h-40" />;
  if (!data) return null;

  const gaugeValue = ((data.composite_score + 1) / 2) * 100;
  const tone = sentimentTone(data.composite_score);
  // Chart fills need a resolved colour string; text uses the class.
  const fill = pal ? pal[tone] : undefined;

  const sources = [
    { name: "StockTwits", value: data.stocktwits_score ?? 0 },
    { name: "Reddit", value: data.reddit_score ?? 0 },
    { name: t("newsFinbert"), value: data.news_score ?? 0 },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{t("title")}</span>
        <span className="text-xs text-muted-foreground">
          {data.composite_score >= 0 ? "+" : ""}{(data.composite_score * 100).toFixed(0)} {t("composite")}
        </span>
      </div>

      <div className="flex gap-6 items-center">
        {/* Gauge */}
        <div className="relative w-32 h-32 flex-shrink-0">
          {/* The palette resolves on the client; until then the gauge is an empty ring. */}
          {pal ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="85%" startAngle={180} endAngle={0}
                data={[{ value: gaugeValue, fill }]}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background={{ fill: pal.muted }} dataKey="value" cornerRadius={4} angleAxisId={0} />
              </RadialBarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
            <span className={`text-xl font-bold font-mono ${TONE_TEXT[tone]}`}>
              {data.composite_score >= 0 ? "+" : ""}{(data.composite_score * 100).toFixed(0)}
            </span>
            <span className="text-xs text-muted-foreground">{t("gaugeLabel")}</span>
          </div>
        </div>

        {/* Source breakdown */}
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-2">{t("bySource")}</div>
          <div className="h-28">
            {pal && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sources} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 10, fill: pal.mutedFg }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: pal.mutedFg }} width={85} />
                  <Tooltip
                    formatter={(v: number) => [`${(v * 100).toFixed(1)}`, t("score")]}
                    contentStyle={{ background: pal.panel, border: `1px solid ${pal.border}`, color: pal.ink, borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="value" fill={fill} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* StockTwits extra */}
        {data.stocktwits_bull_pct !== undefined && (
          <div className="flex-shrink-0 text-center">
            <div className="text-xs text-muted-foreground mb-1">{t("stBullPct")}</div>
            <div className="text-2xl font-bold font-mono text-signal-long">
              {(data.stocktwits_bull_pct * 100).toFixed(0)}%
            </div>
            {data.message_volume && (
              <div className="text-xs text-muted-foreground">{t("watchers", { count: data.message_volume.toLocaleString() })}</div>
            )}
          </div>
        )}
      </div>

      {/* Polygon precision-tagged "why" — provider per-ticker insight + reasoning */}
      {data.polygon_reasoning && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-signal/15 text-signal border border-signal/30">
              {t("polygonRead")}
            </span>
            {data.polygon_score != null && (
              <span className={`text-xs font-mono font-semibold ${TONE_TEXT[sentimentTone(data.polygon_score)]}`}>
                {data.polygon_score >= 0 ? "+" : ""}{(data.polygon_score * 100).toFixed(0)}
              </span>
            )}
            {data.polygon_articles ? (
              <span className="text-[11px] text-muted-foreground">
                {t("polygonInsights", { count: data.polygon_articles })}
              </span>
            ) : null}
          </div>
          {data.polygon_headline && (
            <div className="text-xs font-medium text-foreground mb-0.5">{data.polygon_headline}</div>
          )}
          <p className="text-xs text-muted-foreground leading-snug line-clamp-3">{data.polygon_reasoning}</p>
        </div>
      )}
    </div>
  );
}
