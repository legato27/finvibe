"use client";

/**
 * YourExposure — you, relative to this name. Signed out it asks you to sign
 * in; signed in it says whether the ticker is held (shares, average cost,
 * market value, unrealised P&L across every portfolio) and which watchlists
 * carry it. The heavier held-position sections (advice, options for the
 * position, transactions) live on the page itself and render only when
 * `position` is set.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import Panel from "@/components/ui/Panel";
import Stat from "@/components/ui/Stat";
import { useAppStore } from "@/store/useAppStore";

export type Position = { totalShares: number; avgCost: number; lotCount: number; portfolioIds: number[] };

export function YourExposure({
  signedIn,
  position,
  currentPrice,
  listNames,
}: {
  signedIn: boolean;
  position: Position | null;
  currentPrice: number;
  listNames: string[];
}) {
  const t = useTranslations("stock");
  const hideBalances = useAppStore((s) => s.hideBalances);

  if (!signedIn) {
    return (
      <Panel label={t("exposureTitle")} reading={t("exposureSignedOut")}>
        <Link href="/login" className="inline-flex rounded-control bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:opacity-90">
          {t("exposureSignIn")}
        </Link>
      </Panel>
    );
  }

  const lists = listNames.length ? t("onLists", { count: listNames.length, names: listNames.join(" · ") }) : t("onNoLists");
  const pill = position
    ? "bg-signal-long-bg text-signal-long"
    : "bg-muted text-muted-foreground";

  if (!position) {
    return (
      <Panel label={t("exposureTitle")} aside={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}>{t("notHeld")}</span>} reading={lists}>
        <div className="nums font-mono text-2xl font-bold text-dim" aria-hidden="true">—</div>
      </Panel>
    );
  }

  const mkt = currentPrice * position.totalShares;
  const cost = position.avgCost * position.totalShares;
  const pnl = mkt - cost;
  const pct = cost > 0 ? (pnl / cost) * 100 : 0;
  const money = (n: number) => (hideBalances ? "••••" : `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  const shares = position.totalShares % 1 === 0 ? position.totalShares : position.totalShares.toFixed(4);

  return (
    <Panel
      label={t("exposureTitle")}
      qualifier={t("inPortfolios", { count: position.portfolioIds.length })}
      aside={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}>{t("held")}</span>}
      reading={lists}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label={t("sharesLabel")} value={shares} sub={position.lotCount > 1 ? t("lots", { count: position.lotCount }) : undefined} size="sm" />
        <Stat label={t("avgCost")} value={`$${position.avgCost.toFixed(2)}`} size="sm" />
        <Stat label={t("mktValue")} value={currentPrice > 0 ? money(mkt) : "—"} size="sm" />
        <Stat
          label={t("unrealisedPnl")}
          value={currentPrice > 0 ? `${pnl >= 0 ? "+" : "−"}${money(pnl)}` : "—"}
          sub={currentPrice > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : undefined}
          tone={currentPrice > 0 ? (pnl < 0 ? "short" : "long") : "muted"}
          size="sm"
        />
      </div>
    </Panel>
  );
}
