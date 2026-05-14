import { getTranslations } from "next-intl/server";
import { McpSubnav } from "@/components/settings/McpSubnav";

export default async function McpSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("settings");
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">
        {t("mcp")}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("subtitleMcp")}
      </p>
      <McpSubnav />
      {children}
    </div>
  );
}
