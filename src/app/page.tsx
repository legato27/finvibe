import { createServerSupabase } from "@/lib/supabase/server";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { MarketingLanding } from "@/components/dashboard/MarketingLanding";

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <DashboardView /> : <MarketingLanding />;
}
