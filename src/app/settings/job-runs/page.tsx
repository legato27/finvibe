import { getTranslations } from "next-intl/server";
import { JobRunsCard } from "@/components/settings/JobRunsCard";
import { StagingCoverageCard } from "@/components/settings/StagingCoverageCard";

export const metadata = { title: "Job runs · vibefin" };

export default async function JobRunsSettingsPage() {
  const t = await getTranslations("jobRuns");
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">{t("title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("intro")}</p>
      <div className="space-y-4">
        <JobRunsCard />
        {/* Sits under the job table on purpose: that table is served by
            DGX and goes blank in exactly the failure this card describes. */}
        <StagingCoverageCard />
      </div>
    </div>
  );
}
