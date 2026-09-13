"use client";

/**
 * The crypto module's pieces on shared surfaces. Each shared file calls one
 * of these behind `isCryptoTicker`, and each renders nothing when the module
 * is switched off, so the shared files never need editing again.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat from "@/components/ui/Stat";
import Chip from "@/components/ui/Chip";
import { cryptoApi } from "@/modules/crypto/api";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";
import { sessionLine } from "@/modules/crypto/lib/desk";

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 4 : 2 })}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

/** The chip beside a crypto ticker on the watchlist. */
export function CryptoChip() {
  const t = useTranslations("crypto");
  if (!CRYPTO_MODULE_ENABLED) return null;
  return (
    <span className="rounded-full border border-protocol/50 bg-protocol-bg px-1.5 py-0.5 text-[9px] text-protocol" title={t("chip.title")}>
      {t("chip.label")}
    </span>
  );
}

/** A dash that says why: valuation and options do not apply to a coin. */
export function CryptoNa() {
  const t = useTranslations("crypto");
  return <span className="text-dim" title={t("chip.na")} aria-label={t("chip.na")}>—</span>;
}

/** Live Binance tickers for a set of coins, for the watchlist's price cell. */
export function useCryptoLivePrices(tickers: string[]) {
  const enabled = CRYPTO_MODULE_ENABLED && tickers.length > 0;
  const key = [...tickers].sort().join(",");
  return useQuery({
    queryKey: ["crypto-desk", "tickers", key],
    queryFn: () => cryptoApi.tickers(tickers),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}

/** The stock page's sections for a coin, in place of DCF/thoughts/options/models. */
export function CryptoStockSections({ ticker }: { ticker: string }) {
  const t = useTranslations("crypto");
  const symbol = ticker.toUpperCase();
  const isBtc = symbol === "BTC-USD" || symbol === "BTC";
  const { data: live, isLoading } = useQuery({ queryKey: ["crypto-desk", "tickers", symbol], queryFn: () => cryptoApi.tickers([symbol]), staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
  const { data: reading } = useQuery({ queryKey: ["crypto-desk", "reading"], queryFn: () => cryptoApi.reading("4h"), enabled: isBtc, staleTime: 60_000, retry: 1 });
  if (!CRYPTO_MODULE_ENABLED) return null;
  const q = live?.tickers?.[symbol];
  const session = sessionLine(reading?.session);
  const deskLink = (
    <Link href="/desk/crypto" className="inline-flex items-center gap-0.5 text-[11px] text-signal hover:underline">
      {t("stock.openDesk")}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
  return (
    <section id="crypto" className="scroll-mt-24 space-y-4">
      {isLoading ? (
        <PanelPending label={t("stock.label")} text={t("loading")} />
      ) : !q ? (
        <PanelUnavailable label={t("stock.label")} reason={t("stock.unavailable")} aside={deskLink} />
      ) : (
        <Panel label={t("stock.label")} qualifier={t("stock.qualifier")} aside={deskLink} reading={isBtc && reading?.reading ? reading.reading : t("stock.reading")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("stock.price")} value={usd(q.price)} sub={pct(q.change_24h_pct)} tone={(q.change_24h_pct ?? 0) >= 0 ? "long" : "short"} size="sm" />
            <Stat label={t("stock.high")} value={usd(q.high_24h)} size="sm" />
            <Stat label={t("stock.low")} value={usd(q.low_24h)} size="sm" />
            <Stat label={t("stock.volume")} value={q.volume_24h != null ? `$${(q.volume_24h / 1e6).toFixed(0)}M` : "—"} size="sm" />
          </div>
          {isBtc && reading?.session && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tone={session.active ? "signal" : "plain"}><span className="font-mono">{session.text}</span></Chip>
              {reading.setup && <Chip tone="protocol"><span className="font-mono">{(reading.setup.setup_type ?? "").replace(/_/g, " ").toLowerCase()}</span></Chip>}
            </div>
          )}
        </Panel>
      )}
    </section>
  );
}
