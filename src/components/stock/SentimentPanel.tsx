"use client";
import { useQuery } from "@tanstack/react-query";
import { sentimentApi } from "@/lib/api";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

interface Props { ticker: string }

function sentimentColor(score: number) {
  if (score > 0.3) return "#22c55e";
  if (score > 0.05) return "#86efac";
  if (score > -0.05) return "#94a3b8";
  if (score > -0.3) return "#fca5a5";
  return "#ef4444";
}

export function SentimentPanel({ ticker }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["sentiment", ticker],
    queryFn: () => sentimentApi.ticker(ticker),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="card animate-pulse h-40" />;
  if (!data) return null;

  const gaugeValue = ((data.composite_score + 1) / 2) * 100;
  const color = sentimentColor(data.composite_score);

  const sources = [
    { name: "StockTwits", value: data.stocktwits_score ?? 0 },
    { name: "Reddit", value: data.reddit_score ?? 0 },
    { name: "News (FinBERT)", value: data.news_score ?? 0 },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Sentiment</span>
        <span className="text-xs text-slate-500">
          {data.composite_score >= 0 ? "+" : ""}{(data.composite_score * 100).toFixed(0)} composite
        </span>
      </div>

      <div className="flex gap-6 items-center">
        {/* Gauge */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="85%" startAngle={180} endAngle={0}
              data={[{ value: gaugeValue, fill: color }]}>
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar background={{ fill: "#1e293b" }} dataKey="value" cornerRadius={4} angleAxisId={0} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
            <span className="text-xl font-bold font-mono" style={{ color }}>
              {data.composite_score >= 0 ? "+" : ""}{(data.composite_score * 100).toFixed(0)}
            </span>
            <span className="text-xs text-slate-500">Sentiment</span>
          </div>
        </div>

        {/* Source breakdown */}
        <div className="flex-1">
          <div className="text-xs text-slate-500 mb-2">By Source</div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sources} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={85} />
                <Tooltip
                  formatter={(v: number) => [`${(v * 100).toFixed(1)}`, "Score"]}
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* StockTwits extra */}
        {data.stocktwits_bull_pct !== undefined && (
          <div className="flex-shrink-0 text-center">
            <div className="text-xs text-slate-500 mb-1">ST Bull %</div>
            <div className="text-2xl font-bold font-mono text-green-400">
              {(data.stocktwits_bull_pct * 100).toFixed(0)}%
            </div>
            {data.message_volume && (
              <div className="text-xs text-slate-500">{data.message_volume.toLocaleString()} watchers</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
