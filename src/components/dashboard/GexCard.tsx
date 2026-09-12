"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";
import { ShieldAlert, TrendingUp, TrendingDown } from "lucide-react";
import { InfoTip } from "@/components/shared/InfoTip";

// Regime → tone. Text colour for the figure, text + tint + border for the pill.
const REGIME_TONE: Record<string, { text: string; pill: string }> = {
  long_gamma: { text: "text-signal-long", pill: "text-signal-long bg-signal-long-bg border-signal-long/30" },
  positive_gamma: { text: "text-signal-long-strong", pill: "text-signal-long-strong bg-signal-long-bg border-signal-long/30" },
  neutral_gamma: { text: "text-signal-caution", pill: "text-signal-caution bg-signal-caution-bg border-signal-caution/30" },
  negative_gamma: { text: "text-signal-short", pill: "text-signal-short bg-signal-short-bg border-signal-short/30" },
  deep_negative: { text: "text-signal-break", pill: "text-signal-break bg-signal-break-bg border-signal-break/30" },
};
const NEUTRAL_TONE = { text: "text-signal-neutral", pill: "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/30" };

const REGIME_KEY_MAP: Record<string, string> = {
  long_gamma: "gexRegimeLongGamma",
  positive_gamma: "gexRegimePositiveGamma",
  neutral_gamma: "gexRegimeNeutralGamma",
  negative_gamma: "gexRegimeNegativeGamma",
  deep_negative: "gexRegimeDeepNegative",
};

export function GexCard() {
  const t = useTranslations("dashboard");
  const { data: gex } = useQuery({
    queryKey: ["gex"],
    queryFn: macroApi.gex,
    staleTime: 60_000 * 5,
  });

  if (!gex || gex.error) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">{t("gexLoading")}</div>
      </div>
    );
  }

  const tone = REGIME_TONE[gex.regime] || NEUTRAL_TONE;
  const isPositive = gex.net_gex > 0;
  const regimeLabel = REGIME_KEY_MAP[gex.regime]
    ? t(REGIME_KEY_MAP[gex.regime])
    : String(gex.regime).replace(/_/g, " ").toUpperCase();

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <span className="card-title flex items-center gap-1">
            {t("gexTitle")}
            <InfoTip tip={t("gexInfo")} />
          </span>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${tone.pill}`}>
          {regimeLabel}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {/* Net GEX */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              {t("gexNet")} <InfoTip size={10} tip={t("gexNetTip")} />
            </div>
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-signal-long" />
              ) : (
                <TrendingDown className="w-4 h-4 text-signal-short" />
              )}
              <span className={`text-2xl font-bold font-mono ${tone.text}`}>
                {gex.net_gex > 0 ? "+" : ""}{gex.net_gex}{gex.net_gex_unit || "M"}
              </span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2 text-center">
            <div className="bg-muted/50 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">{t("gexCall")}</div>
              <div className="font-mono text-xs text-signal-long">{gex.call_gex}{gex.net_gex_unit || "M"}</div>
            </div>
            <div className="bg-muted/50 rounded p-1.5">
              <div className="text-[10px] text-muted-foreground">{t("gexPut")}</div>
              <div className="font-mono text-xs text-signal-short">{gex.put_gex}{gex.net_gex_unit || "M"}</div>
            </div>
          </div>
        </div>

        {/* Zero-Gamma Level */}
        {gex.zero_gamma_level && (
          <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  {t("gexZero")} <InfoTip size={10} tip={t("gexZeroTip")} />
                </div>
                <div className="text-lg font-bold font-mono text-signal-caution">
                  ${gex.zero_gamma_level}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">{t("gexSpot")}</div>
                <div className="text-sm font-mono text-foreground">${gex.spot}</div>
              </div>
              {gex.distance_to_zero != null && (
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">{t("gexDistance")}</div>
                  <div className={`text-sm font-mono font-bold ${gex.distance_to_zero > 0 ? "text-signal-long" : "text-signal-short"}`}>
                    {gex.distance_to_zero > 0 ? "+" : ""}{gex.distance_to_zero}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Regime description */}
        <p className="text-xs text-muted-foreground italic leading-relaxed">{gex.regime_description}</p>
      </div>
    </div>
  );
}
