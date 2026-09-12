"use client";
import { useTranslations } from "next-intl";
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

/** Cell tint: sign picks the hue, magnitude picks the alpha step. Ink stays
 *  the page foreground so it reads on every step in both themes; the sign is
 *  also in the text, so the hue is never the only carrier. */
function perfCellClass(value: number | undefined): string {
  if (value === undefined || value === null) return "bg-muted text-muted-foreground";
  if (value >= 10) return "bg-signal-long/60 text-foreground";
  if (value >= 5) return "bg-signal-long/45 text-foreground";
  if (value >= 2) return "bg-signal-long/30 text-foreground";
  if (value >= 0) return "bg-signal-long/15 text-foreground";
  if (value >= -2) return "bg-signal-short/15 text-foreground";
  if (value >= -5) return "bg-signal-short/30 text-foreground";
  if (value >= -10) return "bg-signal-short/45 text-foreground";
  return "bg-signal-short/60 text-foreground";
}

function forecastClass(value: number | undefined): string {
  if (value == null) return "text-muted-foreground";
  if (value >= 8) return "text-signal-long";
  if (value >= 4) return "text-signal-long-strong";
  if (value >= 0) return "text-signal-caution";
  if (value >= -3) return "text-signal-short";
  return "text-signal-break";
}

function rankClass(rank: number): string {
  return rank <= 3 ? "text-signal-long" : rank >= 9 ? "text-signal-short" : "text-signal-neutral";
}

export function SectorRotationHeatmap() {
  const t = useTranslations("dashboard");
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
        <div className="text-muted-foreground text-sm animate-pulse">{t("sectorLoading")}</div>
      </div>
    );
  }

  // Build forecast lookup: sector name → expected return
  const forecastMap: Record<string, number> = {};
  if (regimeData?.forecasts) {
    for (const f of regimeData.forecasts) {
      forecastMap[f.sector] = f.expected_return;
    }
  }

  const sorted = [...sectorRotation].sort((a, b) => {
    const fa = forecastMap[a.sector] ?? -Infinity;
    const fb = forecastMap[b.sector] ?? -Infinity;
    if (fa !== -Infinity || fb !== -Infinity) return fb - fa;
    return (a.rs_rank || 11) - (b.rs_rank || 11);
  });

  return (
    <div className="card h-full">
      <div className="card-header">
        <span className="card-title flex items-center gap-1">
          {t("sectorRotation")}
          <InfoTip tip={t("sectorRotationInfo")} />
        </span>
        <div className="flex items-center gap-2">
          {regimeData && (
            <span className="text-[9px] px-1.5 py-0.5 bg-signal/15 text-signal rounded border border-signal/20">
              {t("sectorRegimeBadge", { regime: regimeData.regime })}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{t("sectorRsRank")}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left pb-2 pr-2 font-normal w-36">{t("sectorColSector")}</th>
              <th className="text-center pb-2 px-1 font-normal">{t("sectorColEtf")}</th>
              {regimeData && (
                <th className="text-center pb-2 pl-1 font-normal w-16" title={t("sectorColFwdTitle")}>
                  {t("sectorColFwd")}
                </th>
              )}
              {WINDOWS.map(({ label }) => (
                <th key={label} className="text-center pb-2 px-1 font-normal w-14">{label}</th>
              ))}
              <th className="text-center pb-2 pl-1 font-normal">{t("sectorColRank")}</th>
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
                    <td className="py-1 pl-1 text-center">
                      {forecast != null ? (
                        <span
                          className={`font-mono font-bold text-[11px] ${forecastClass(forecast)}`}
                          title={t("sectorFwdTitle", { regime: regimeData.regime, sector: row.sector, forecast })}
                        >
                          {forecast >= 0 ? "+" : ""}{forecast.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  {WINDOWS.map(({ key }) => {
                    const val = row[key];
                    return (
                      <td
                        key={key}
                        className={`py-1 px-1 text-center font-mono rounded ${perfCellClass(val)}`}
                      >
                        {val !== undefined && val !== null
                          ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`
                          : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-1 text-center">
                    <span className={`font-mono font-bold ${rankClass(row.rs_rank || 11)}`}>
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
              <span className="text-signal font-medium">{t("sectorLegendFwd")}</span> {t("sectorLegendDesc")}{" "}
              <span className="text-signal">{regimeData.regime}</span> {t("sectorLegendRegimes")}
            </span>
            <span>
              {t("sectorFavors")} <span className="text-signal-long font-medium">{regimeData.top_3?.join(", ")}</span>
            </span>
            <span>
              {t("sectorAvoids")} <span className="text-signal-short font-medium">{regimeData.bottom_3?.join(", ")}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
