import { CurrencyCard } from "@/components/settings/CurrencyCard";

export const metadata = { title: "Currency · vibefin" };

export default function CurrencySettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">Currency</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Default display currency and live FX rates.
      </p>
      <CurrencyCard />
    </div>
  );
}
