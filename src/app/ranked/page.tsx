"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { modelsApi } from "@/lib/api";

interface RankedRow {
  ticker: string;
  sector: string | null;
  composite_z: number;
  rank: number;
  percentile: number;
  bucket: "long" | "short" | "neutral";
  factors: Record<string, number>;
  factors_used: number;
}

interface RankedBook {
  universe_size: number;
  factors: string[];
  method: string;
  excluded_insufficient_data?: { ticker: string }[];
  ranked: RankedRow[];
}

const BUCKET_STYLE: Record<string, string> = {
  long: "text-emerald-400",
  short: "text-red-400",
  neutral: "text-muted-foreground",
};

function bucketIcon(b: string) {
  if (b === "long") return <TrendingUp className="w-3.5 h-3.5" />;
  if (b === "short") return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

export default function RankedBookPage() {
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");
  const { data, isLoading, error } = useQuery<RankedBook>({
    queryKey: ["cross-sectional-ranked"],
    queryFn: () => modelsApi.crossSectional(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Ranked Book</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Cross-sectional composite z-score across the watchlist universe. Top quintile = long, bottom = short.
        </p>
      </div>

      {isLoading && <div className="card p-6 text-sm text-muted-foreground">Computing cross-sectional ranking…</div>}
      {error && <div className="card p-6 text-sm text-red-400">Failed to load ranking.</div>}

      {data && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{data.universe_size} names</span>
            <span>·</span>
            <span>factors: {data.factors.join(", ")}</span>
            {data.excluded_insufficient_data?.length ? (
              <>
                <span>·</span>
                <span>{data.excluded_insufficient_data.length} excluded (sparse data)</span>
              </>
            ) : null}
          </div>

          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
            {(["all", "long", "short"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                  filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground/80"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Ticker</th>
                  <th className="text-left p-2 hidden sm:table-cell">Sector</th>
                  <th className="text-right p-2">Composite z</th>
                  <th className="text-right p-2 hidden md:table-cell">%ile</th>
                  <th className="text-center p-2">Signal</th>
                </tr>
              </thead>
              <tbody>
                {data.ranked
                  .filter((r) => filter === "all" || r.bucket === filter)
                  .map((r) => (
                    <tr key={r.ticker} className="border-b border-border/10 hover:bg-accent/40">
                      <td className="p-2 text-muted-foreground font-mono">{r.rank}</td>
                      <td className="p-2">
                        <Link href={`/stock/${r.ticker}`} className="font-medium text-primary hover:underline">
                          {r.ticker}
                        </Link>
                      </td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{r.sector ?? "—"}</td>
                      <td className={`p-2 text-right font-mono ${r.composite_z >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.composite_z >= 0 ? "+" : ""}
                        {r.composite_z.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-muted-foreground hidden md:table-cell">
                        {r.percentile.toFixed(0)}
                      </td>
                      <td className={`p-2 ${BUCKET_STYLE[r.bucket]}`}>
                        <span className="flex items-center justify-center gap-1 capitalize">
                          {bucketIcon(r.bucket)}
                          {r.bucket}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted-foreground">{data.method}</p>
        </>
      )}
    </div>
  );
}
