import { LoginHistoryCard } from "@/components/settings/LoginHistoryCard";

export const metadata = { title: "Login history · vibefin" };

export default function LoginHistorySettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">Login history</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Recent sign-ins and account events.
      </p>
      <LoginHistoryCard />
    </div>
  );
}
