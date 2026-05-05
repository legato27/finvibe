import { ProfileCard } from "@/components/settings/ProfileCard";

export const metadata = { title: "Profile · vibefin" };

export default function ProfileSettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">Profile</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Account information shown across vibefin.
      </p>
      <ProfileCard />
    </div>
  );
}
