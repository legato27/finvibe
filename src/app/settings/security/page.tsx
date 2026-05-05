import { PasswordCard } from "@/components/settings/PasswordCard";
import { SignOutEverywhereCard } from "@/components/settings/SignOutEverywhereCard";

export const metadata = { title: "Security · vibefin" };

export default function SecuritySettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">Security</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Update your password and sign out of all devices.
      </p>
      <PasswordCard />
      <SignOutEverywhereCard />
    </div>
  );
}
