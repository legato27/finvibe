import { getTranslations } from "next-intl/server";
import { ProfileCard } from "@/components/settings/ProfileCard";

export const metadata = { title: "Profile · vibefin" };

export default async function ProfileSettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">{t("profile")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("profileIntro")}
      </p>
      <ProfileCard />
    </div>
  );
}
