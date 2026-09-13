"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InfoTip } from "@/components/shared/InfoTip";
import { TrendingUp, TrendingDown } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import { useLocale } from "next-intl";
import { macroApi } from "@/lib/api";

/** Front-month futures from /api/macro/futures: end-of-day settlement. */
interface FutureProduct {
  code: string;
  label: string;
  short: string;
  error: string | null;
  ticker?: string;
  session_end_date?: string;
  settlement?: number | null;
  change_1d?: number | null;
  change_1m?: number | null;
  days_to_roll?: number;
  sparkline?: number[];
}

interface Instrument {
  key: string;
  label: string;
  value: number;
  change_1d: number;
  change_1m: number;
  sparkline: number[];
}

/** `color` is a semantic text-colour class; the line is drawn in currentColor. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const h = 24;
  const w = 60;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className={`flex-shrink-0 ${color}`}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const INSTRUMENT_TIP_KEYS: Record<string, string> = {
  DXY: "macroTipDxy",
  US10Y: "macroTipUs10y",
  Gold: "macroTipGold",
  Oil: "macroTipOil",
  HYG: "macroTipHyg",
  Copper: "macroTipCopper",
};

export function MacroTape() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  // Futures ride on their own query: a failure leaves two tiles that say
  // so, not a tape that waits.
  const { data: fut } = useQuery<{ products: FutureProduct[] }>({
    queryKey: ["macro_futures"],
    queryFn: macroApi.futures,
    staleTime: 15 * 60_000,
    retry: 1,
  });
  const futures: FutureProduct[] = fut?.products ?? [];
  const weekdayOf = (iso?: string) =>
    iso ? new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "";
  const fmtChg = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
  const es = futures.find((p) => p.code === "ES");
  const nq = futures.find((p) => p.code === "NQ");
  const futuresReading =
    es?.settlement != null && nq?.settlement != null
      ? t("futuresReading", { day: weekdayOf(es.session_end_date), esChg: fmtChg(es.change_1d), nqChg: fmtChg(nq.change_1d) })
      : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["macro_tape"],
    queryFn: async () => {
      const res = await fetch("/api/macro/macro-tape");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000 * 10,
  });

  const instruments: Instrument[] = data?.instruments || [];
  const label = (
    <span className="flex items-center gap-1">
      {t("macroTapeTitle")} <InfoTip tip={t("macroTapeInfo")} />
    </span>
  );
  if (isLoading) return <PanelPending label={label} text={t("loadingGeneric")} className="h-full" />;
  if (instruments.length === 0) return <PanelUnavailable label={label} reason={t("notAvailableReason")} className="h-full" />;

  return (
    <Panel label={label} qualifier={t("macroTapeSubtitle")} className="h-full" reading={futuresReading}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-border bg-border sm:grid-cols-3 lg:grid-cols-4">
        {(futures.length ? futures : [{ code: "ES", label: "S&P 500 E-mini", short: "ES", error: "pending" }, { code: "NQ", label: "Nasdaq-100 E-mini", short: "NQ", error: "pending" }]).map((p) => {
          const has = p.settlement != null;
          const up1d = (p.change_1d ?? 0) >= 0;
          const up1m = (p.change_1m ?? 0) >= 0;
          return (
            <div key={`fut-${p.code}`} className="bg-card p-3 space-y-1.5" title={p.ticker ? t("futuresTitle", { ticker: p.ticker }) : undefined}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  {p.label}
                  <InfoTip size={9} tip={t("macroTipFutures")} />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-dim">{t("futuresDelayed")}</span>
              </div>
              <div className={`text-sm font-bold font-mono ${has ? "text-foreground" : "text-dim"}`}>
                {has ? p.settlement!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
              </div>
              {has && p.sparkline ? <Sparkline data={p.sparkline} color={up1m ? "text-signal-long" : "text-signal-short"} /> : <div className="h-6" />}
              {has ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`text-[10px] font-mono flex items-center gap-0.5 ${up1d ? "text-signal-long" : "text-signal-short"}`}>
                    {up1d ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {fmtChg(p.change_1d)}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {t("futuresSettled", { day: weekdayOf(p.session_end_date).slice(0, 3), days: p.days_to_roll ?? 0 })}
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground">{p.error === "pending" ? t("loadingGeneric") : t("futuresUnavailable")}</div>
              )}
            </div>
          );
        })}
        {instruments.map((inst) => {
          const up1d = inst.change_1d >= 0;
          const up1m = inst.change_1m >= 0;
          const sparkColor = up1m ? "text-signal-long" : "text-signal-short";
          const tipKey = INSTRUMENT_TIP_KEYS[inst.key];
          const tipText = tipKey ? t(tipKey) : t("macroFallback", { label: inst.label });

          return (
            <div key={inst.key} className="bg-card p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  {inst.label}
                  <InfoTip size={9} tip={tipText} />
                </span>
              </div>

              <div className="text-sm font-bold font-mono text-foreground">
                {inst.key === "US10Y" ? `${inst.value}%` :
                 inst.key === "DXY" ? inst.value.toFixed(2) :
                 `$${inst.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              </div>

              <Sparkline data={inst.sparkline} color={sparkColor} />

              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono flex items-center gap-0.5 ${up1d ? "text-signal-long" : "text-signal-short"}`}>
                  {up1d ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {up1d ? "+" : ""}{inst.change_1d.toFixed(2)}%
                </span>
                <span className={`text-[9px] font-mono ${up1m ? "text-signal-long/60" : "text-signal-short/60"}`}>
                  1M {up1m ? "+" : ""}{inst.change_1m.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
