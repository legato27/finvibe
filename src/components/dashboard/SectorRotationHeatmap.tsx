"use client";
import { useAppStore } from "@/store/useAppStore";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { InfoTip } from "@/components/shared/InfoTip";

const WINDOWS = [
  { key: "perf_1m", label: "1M" },
  { key: "perf_3m", label: "3M" },
  { key: "perf_6m", label: "6M" },
  { key: "perf_12m", label: "12M" },
] as const;

function perfColor(value: number | undefined): string {
  if (value === undefined || value === null) return "var(--perf-null, #1e293b)";
  if (value >= 10) return "#14532d";
  if (value >= 5) return "#166534";
  if (value >= 2) return "#15803d";
  if (value >= 0) return "#166534aa";
  if (value >= -2) return "#7f1d1d99";
  if (value >= -5) return "#7f1d1d";
  if (value >= -10) return "#991b1b";
  return "#450a0a";
}

function perfTextColor(value: number | undefined): string {
  if (value === undefined || value === null) return "#64748b";
  return value >= 0 ? "#86efac" : "#fca5a5";
}

function forecastColor(value: number | undefined): string {
  if (value == null) return "#64748b";
  if (value >= 8) return "#22c55e";
  if (value >= 4) return "#86efac";
  if (value >= 0) return "#fbbf24";
  if (value >= -3) return "#f97316";
  return "#ef4444";
}

export function SectorRotationHeatmap() {
  const sectorRotation = useAppStore((s) => s.macro.sectorRotation);

  // Fetch regime-conditioned sector forecast
  const { data: regimeData } = useQuery({
    queryKey: ["regime_sectors"],
    queryFn: macroApi.regimeSectors,
    staleTime: 60_000 * 10,
  });

  if (!sectorRotation || sectorRotation.length === 0) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Loading Sectors...</div>
      </div>
    );
  }

  // Sort by 60D Forward return (descending) if available, else by RS Rank
  const sorted = [...sectorRotation].sort((a, b) => {
    const fa = forecastMap[a.sector] ?? -Infinity;
    const fb = forecastMap[b.sector] ?? -Infinity;
    if (fa !== -Infinity || fb !== -Infinity) return fb - fa;
    return (a.rs_rank || 11) - (b.rs_rank || 11);
  });

  // Build forecast lookup: sector name → expected return
  const forecastMap: Record<string, number> = {};
  if (regimeData?.forecasts) {
    for (const f of regimeData.forecasts) {
      forecastMap[f.sector] = f.expected_return;
    }
  }

  return (
    <div className="card h-full">
      <div className="card-header">
        <span className="card-title flex items-center gap-1">
          Sector Rotation
          <InfoTip tip="Sector rotation tracks which parts of the economy are leading or lagging. Money flows between sectors based on the business cycle: Early cycle favors Tech & Discretionary, Late cycle favors Energy & Materials, Recession favors Utilities & Staples. The RS Rank shows relative strength (1=strongest). 60D Fwd shows historical average returns for each sector during the current regime." />
        </span>
        <div className="flex items-center gap-2">
          {regimeData && (
            <span className="text-[9px] px-1.5 py-0.5 bg-primary/15 text-primary rounded border border-primary/20">
              {regimeData.regime} regime
            </span>
          )}
          <span className="text-xs text-muted-foreground">RS Rank</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left pb-2 pr-2 font-normal w-36">Sector</th>
              <th className="text-center pb-2 px-1 font-normal">ETF</th>
              {regimeData && (
                <th className="text-center pb-2 px-1 font-normal w-16" title="Expected 60-day forward return based on current regime">
                  60D Fwd
                </th>
              )}
              {WINDOWS.map(({ label }) => (
                <th key={label} className="text-center pb-2 px-1 font-normal w-14">{label}</th>
              ))}
              <th className="text-center pb-2 pl-1 font-normal">Rank</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const forecast = forecastMap[row.sector];
              return (
                <tr key={row.sector} className="border-t border-border/30">
                  <td className="py-1 pr-2 text-foreground font-medium truncate max-w-[140px]" title={row.sector}>
                    {row.sector.replace("Consumer ", "Con. ").replace("Communication ", "Comm. ")}
                  </td>
                  <td className="py-1 px-1 text-center font-mono text-muted-foreground">{row.etf_ticker}</td>
                  {regimeData && (
                    <td className="py-1 px-1 text-center">
                      {forecast != null ? (
                        <span
                          className="font-mono font-bold text-[11px]"
                          style={{ color: forecastColor(forecast) }}
                          title={`In past ${regimeData.regime} regimes, ${row.sector} averaged ${forecast}% over 60 days`}
                        >
                          {forecast >= 0 ? "+" : ""}{forecast.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  )}
                  {WINDOWS.map(({ key }) => {
                    const val = row[key];
                    return (
                      <td
                        key={key}
                        className="py-1 px-1 text-center font-mono rounded"
                        style={{
                          backgroundColor: perfColor(val),
                          color: perfTextColor(val),
                        }}
                      >
                        {val !== undefined && val !== null
                          ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`
                          : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-1 text-center">
                    <span
                      className="font-mono font-bold"
                      style={{
                        color: (row.rs_rank || 11) <= 3 ? "#22c55e" : (row.rs_rank || 11) >= 9 ? "#ef4444" : "#94a3b8",
                      }}
                    >
                      #{Math.round(row.rs_rank || 11)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Regime forecast legend */}
      {regimeData && (
        <div className="border-t border-border/30 mt-1 pt-1.5 px-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-muted-foreground">
            <span>
              <span className="text-primary font-medium">60D Fwd</span> = historical avg return in{" "}
              <span className="text-primary">{regimeData.regime}</span> regimes (not a prediction)
            </span>
            <span>
              Regime favors: <span className="text-green-400 font-medium">{regimeData.top_3?.join(", ")}</span>
            </span>
            <span>
              Regime avoids: <span className="text-red-400 font-medium">{regimeData.bottom_3?.join(", ")}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
