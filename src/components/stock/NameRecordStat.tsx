"use client";

/**
 * NameRecordStat — your record on this name: option trades won over
 * settled, with realised P&L across options and share sales, linking to
 * the Desk's track record. Sits in the exposure card's Stat grid for a
 * held name.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import Stat from "@/components/ui/Stat";
import { createClient } from "@/lib/supabase/client";
import { useOptionsTrades } from "@/lib/supabase/hooks";
import { useAppStore } from "@/store/useAppStore";

export function NameRecordStat({ ticker }: { ticker: string }) {
  const t = useTranslations("stock");
  const hideBalances = useAppStore((s) => s.hideBalances);
  const { data: trades } = useOptionsTrades();
  const { data: sales } = useQuery({
    queryKey: ["stock-sales-ticker", ticker],
    queryFn: async () => {
      const { data, error } = await createClient().from("stock_sales").select("realized_pnl").eq("ticker", ticker.toUpperCase());
      if (error) throw error;
      return (data ?? []) as Array<{ realized_pnl: number }>;
    },
    staleTime: 60_000,
  });

  const mine = (trades ?? []).filter((tr) => tr.ticker.toUpperCase() === ticker.toUpperCase() && tr.status !== "open");
  const won = mine.filter((tr) => tr.was_profitable ?? (tr.realized_pnl ?? 0) > 0).length;
  const pnl = mine.reduce((s, tr) => s + (tr.realized_pnl ?? 0), 0) + (sales ?? []).reduce((s, x) => s + (x.realized_pnl ?? 0), 0);
  const any = mine.length > 0 || (sales?.length ?? 0) > 0;
  const money = hideBalances ? "••••" : `${pnl < 0 ? "−" : "+"}$${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <Link href="/desk#track-record" className="rounded-control hover:bg-accent">
      <Stat
        label={t("recordLabel")}
        value={mine.length ? `${won}/${mine.length}` : "—"}
        sub={any ? t("recordSub", { pnl: money, sales: sales?.length ?? 0 }) : t("recordNone")}
        tone={!any ? "muted" : pnl < 0 ? "short" : "long"}
        size="sm"
      />
    </Link>
  );
}
