import { getTranslations } from "next-intl/server";
import { PasswordCard } from "@/components/settings/PasswordCard";
import { SignOutEverywhereCard } from "@/components/settings/SignOutEverywhereCard";

export const metadata = { title: "Security · vibefin" };

export default async function SecuritySettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">{t("security")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("securityIntro")}
      </p>
      <PasswordCard />
      <SignOutEverywhereCard />
    </div>
  );
}
