"use client";

/**
 * Today → the crypto strip: the majors' regimes, funding and OI, liquidation
 * bursts, the scalp engine's signals and the sleeve's state, in one sentence
 * with the figures under it. Never returns null; reads /api/crypto-desk/today.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat from "@/components/ui/Stat";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import Freshness from "@/components/ui/Freshness";
import { cryptoApi } from "@/modules/crypto/api";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";
import { composeCryptoStrip } from "@/lib/readings";

const STATE_TONE: Record<string, ChipTone> = { active: "signal", paused: "caution", halted: "short" };
const PAM_TONE: Record<string, ChipTone> = { UC: "signal", DC: "short", UR: "protocol", DR: "caution", RANGE: "plain" };

export default function CryptoStrip() {
  const t = useTranslations("dashboard.cryptoStrip");
  const { data, isLoading, isError } = useQuery({ queryKey: ["crypto-today"], queryFn: () => cryptoApi.today(), staleTime: 60_000, refetchInterval: 60_000, retry: 1, enabled: CRYPTO_MODULE_ENABLED });
  if (!CRYPTO_MODULE_ENABLED) return null;
  if (isLoading) return <PanelPending label={t("label")} text={t("loading")} />;
  if (isError || !data) return <PanelUnavailable label={t("label")} reason={t("unavailable")} />;
  const strip = composeCryptoStrip(data);
  const r = data.risk;
  return (
    <Panel label={t("label")} reading={strip.reading} aside={<Freshness at={data.as_of} label={t("asOf")} />}>
      <div className="flex flex-wrap items-center gap-2">
        {data.majors.map((m) => (
          <Chip key={m.symbol} tone={PAM_TONE[m.pam_1h ?? ""] ?? "plain"}>{m.symbol.replace("USDT", "")} {m.pam_1h ?? "—"}/{m.pam_4h ?? "—"}</Chip>
        ))}
        <Chip tone={STATE_TONE[r?.state ?? "active"]}>{t(`state.${r?.state ?? "active"}` as never)}</Chip>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat size="sm" label={t("stat.funding")} value={t(`funding.${data.funding_regime ?? "neutral"}` as never)} sub={t("stat.fundingSub", { oi: t(`oi.${data.oi_regime ?? "flat"}` as never) })} />
        <Stat size="sm" label={t("stat.bursts")} value={String(data.liq_burst_minutes_24h)} sub={t("stat.burstsSub")} />
        <Stat size="sm" label={t("stat.signals")} value={String(data.active_signals.length)} sub={t("stat.signalsSub", { today: data.signals_today })} />
        <Stat size="sm" label={t("stat.paper")} value={`${data.paper_realised_r_today >= 0 ? "+" : ""}${data.paper_realised_r_today.toFixed(2)}R`} sub={t("stat.paperSub")} tone={data.paper_realised_r_today > 0 ? "long" : data.paper_realised_r_today < 0 ? "short" : "plain"} />
      </div>
      <p className="mt-2 text-xs"><Link href="/desk/scalp" className="text-primary underline-offset-2 hover:underline">{t("openDesk")}</Link></p>
    </Panel>
  );
}
