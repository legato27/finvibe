import { getTranslations } from "next-intl/server";
import { LoginHistoryCard } from "@/components/settings/LoginHistoryCard";

export const metadata = { title: "Login history · vibefin" };

export default async function LoginHistorySettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">{t("loginHistory")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("loginHistoryIntro")}
      </p>
      <LoginHistoryCard />
    </div>
  );
}
