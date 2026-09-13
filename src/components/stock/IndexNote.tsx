"use client";

/**
 * IndexNote — what an index page does not have, and where to act instead.
 *
 * An index (^GSPC, ^NDX, ^VIX) has a chart and price action but no
 * financials, moat, DCF, thoughts, verdict, option chain or model grid,
 * and it cannot be held. One Panel says so, in place of six pending
 * panels, and points at the ETF that tracks it, whose page has all of
 * that. `isIndexTicker` is the one test the page and the aside share.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import Panel from "@/components/ui/Panel";

export function isIndexTicker(ticker: string): boolean {
  return ticker.startsWith("^");
}

/** Index symbol → the ETF a trader would hold or write options on. */
export const INDEX_TRACKER: Record<string, { etf: string; name: string }> = {
  "^GSPC": { etf: "SPY", name: "S&P 500" },
  "^SPX": { etf: "SPY", name: "S&P 500" },
  "^NDX": { etf: "QQQ", name: "Nasdaq-100" },
  "^IXIC": { etf: "QQQ", name: "Nasdaq Composite" },
  "^DJI": { etf: "DIA", name: "Dow Jones Industrial Average" },
  "^RUT": { etf: "IWM", name: "Russell 2000" },
  "^SOX": { etf: "SOXX", name: "PHLX Semiconductor" },
  "^GDAXI": { etf: "EWG", name: "DAX" },
  "^N225": { etf: "EWJ", name: "Nikkei 225" },
  "^HSI": { etf: "EWH", name: "Hang Seng" },
  "^STI": { etf: "EWS", name: "Straits Times" },
};

export function IndexNote({ ticker, variant = "main" }: { ticker: string; variant?: "main" | "aside" }) {
  const t = useTranslations("stock");
  const tracker = INDEX_TRACKER[ticker.toUpperCase()];
  const aside = tracker ? (
    <Link href={`/stock/${tracker.etf}`} className="inline-flex items-center gap-0.5 text-[11px] text-signal hover:underline">
      {t("indexOpenEtf", { etf: tracker.etf })}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  ) : undefined;

  if (variant === "aside") {
    return (
      <Panel label={t("exposureTitle")} aside={aside} reading={tracker ? t("indexHoldVia", { etf: tracker.etf }) : t("indexHoldNone")}>
        <div className="nums font-mono text-3xl font-bold text-dim" aria-hidden="true">—</div>
      </Panel>
    );
  }
  return (
    <Panel label={t("indexNoteLabel")} aside={aside} reading={t("indexNoteReading")}>
      <p className="text-sm leading-relaxed text-foreground">
        {tracker ? t("indexNoteBodyEtf", { etf: tracker.etf }) : t("indexNoteBody")}
      </p>
    </Panel>
  );
}
