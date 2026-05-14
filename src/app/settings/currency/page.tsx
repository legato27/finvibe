import { getTranslations } from "next-intl/server";
import { CurrencyCard } from "@/components/settings/CurrencyCard";

export const metadata = { title: "Currency · vibefin" };

export default async function CurrencySettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">{t("currency")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("currencyIntro")}
      </p>
      <CurrencyCard />
    </div>
  );
}
