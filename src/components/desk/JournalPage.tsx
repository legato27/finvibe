"use client";

/**
 * Desk → Journal. The trading journal as a page of its own: every trade you
 * logged and every trade the paper broker executed, one family per section,
 * each with its timestamped activity. The desks keep their own journal panel
 * for the family they trade; this is the whole book in one place.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Segmented from "@/components/ui/Segmented";
import TradeJournal from "@/components/stock/TradeJournal";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";

export function JournalPage() {
  const t = useTranslations("journalPage");
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Segmented
          ariaLabel={t("deskSwitch")}
          value="journal"
          onChange={(v) => {
            if (v === "journal") return;
            if (v === "crypto") router.push("/desk/crypto");
            else if (v === "scalp") router.push("/desk/scalp");
            else router.push(`/desk?strategy=${v}`);
          }}
          options={[
            { value: "csp", label: t("switchPuts") },
            { value: "covered_call", label: t("switchCalls") },
            ...(CRYPTO_MODULE_ENABLED ? [{ value: "crypto", label: t("switchCrypto") }, { value: "scalp", label: t("switchScalp") }] : []),
            { value: "journal", label: t("switchJournal") },
          ]}
        />
      </header>

      <section id="options" aria-label={t("optionsSection")}>
        <TradeJournal family="options" />
      </section>

      {CRYPTO_MODULE_ENABLED ? (
        <section id="crypto" aria-label={t("cryptoSection")}>
          <TradeJournal family="crypto" />
        </section>
      ) : null}
    </div>
  );
}
