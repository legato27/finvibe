"use client";

/**
 * The answer at the top of Desk → Scalp: what is actually running. Three
 * strategies on paper (R4b, carry C1, trend T1), each with one plain sentence,
 * where its run stands and its P&L, and one line for the old scalp setups A/B/C
 * and their halt state. Full detail lives on Desk → Crypto (the paper panels)
 * and in the strategy lab below.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import Panel from "@/components/ui/Panel";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import { cryptoApi, type ScalpRisk } from "@/modules/crypto/api";

type Row = { id: string; name: string; what: string; tone: ChipTone; status: string; line: string | null; pnl: number | null };

const money = (v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const day = (iso?: string) => (iso ? iso.slice(0, 10) : "—");

export function RunningNow({ risk }: { risk?: ScalpRisk | null }) {
  const t = useTranslations("scalp.running");
  const opts = { staleTime: 5 * 60_000, refetchInterval: 15 * 60_000, retry: 1 } as const;
  const r4b = useQuery({ queryKey: ["crypto-desk", "r4b-paper"], queryFn: cryptoApi.r4bPaper, ...opts });
  const c1 = useQuery({ queryKey: ["crypto-desk", "carry-paper"], queryFn: cryptoApi.carryPaper, ...opts });
  const t1 = useQuery({ queryKey: ["crypto-desk", "trend-paper"], queryFn: cryptoApi.trendPaper, ...opts });

  const rows: Row[] = [];
  {
    const d = r4b.data;
    const days = d?.gate_so_far?.days ?? 0;
    rows.push({
      id: "R4b", name: t("r4b.name"), what: t("r4b.what"),
      tone: d?.status === "failed" ? "short" : d?.status === "starting" ? "protocol" : "signal",
      status: !d ? t("loading") : d.status === "starting" ? t("startsOn", { date: day(d.started_at) }) : d.status === "failed" ? t("failed")
        : d.status === "passed_running" ? t("passed") : d.status === "not_started" ? t("notStarted") : t("dayOf", { day: days, total: 90 }),
      line: d?.status === "running" || d?.status === "passed_running" ? t("r4b.line", { stops: d.stops ?? 0, gate: day(d.gate_day) }) : null,
      pnl: d?.equity_usd ?? null,
    });
  }
  {
    const d = c1.data;
    rows.push({
      id: "C1", name: t("c1.name"), what: t("c1.what"),
      tone: d?.status === "dropped" ? "short" : "signal",
      status: !d ? t("loading") : d.status === "starting" ? t("startsOn", { date: day(d.started_at) }) : d.status === "dropped" ? t("dropped") : d.status === "passed" ? t("passed")
        : t("dayOf", { day: Math.min(Math.floor(d.days_elapsed ?? 0) + 1, d.days_total ?? 30), total: d.days_total ?? 30 }),
      line: d?.ends_at ? t("c1.line", { end: day(d.ends_at) }) : null,
      pnl: d?.pnl_usd_after_exit ?? null,
    });
  }
  {
    const d = t1.data;
    const pnl = d?.return_after_exit != null && d.capital_usd ? d.return_after_exit * d.capital_usd : null;
    rows.push({
      id: "T1", name: t("t1.name"), what: t("t1.what"),
      tone: d?.status === "dropped" ? "short" : d?.status === "starting" ? "protocol" : "signal",
      status: !d ? t("loading") : d.status === "starting" ? t("startsOn", { date: day(d.started_at) }) : d.status === "dropped" ? t("dropped") : d.status === "passed" ? t("passed")
        : t("weekOf", { week: d.rebalances_done ?? 0, total: d.weeks_total ?? 8 }),
      line: d?.ends_at ? t("t1.line", { end: day(d.ends_at) }) : null,
      pnl,
    });
  }

  const halted = risk?.state !== "active";
  return (
    <Panel label={t("label")} qualifier={t("qualifier")} reading={halted ? t("reading.halted") : t("reading.active")} tone="plain">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-control border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[11px] font-semibold">{r.id}</span>
              <span className="font-semibold">{r.name}</span>
              <Chip tone={r.tone}>{r.status}</Chip>
              {r.pnl != null && <span className={`ml-auto font-mono text-sm nums ${r.pnl >= 0 ? "text-signal-long" : "text-signal-short"}`}>{money(r.pnl)}</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{r.what}</p>
            {r.line && <p className="mt-1 font-mono text-[11px] text-dim">{r.line}</p>}
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-dashed border-border p-3">
          <span className="rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[11px] font-semibold">A/B/C</span>
          <span className="font-semibold text-muted-foreground">{t("abc.name")}</span>
          <Chip tone={halted ? "short" : "caution"}>{halted ? t("abc.halted") : t("abc.active")}</Chip>
          <span className="w-full text-sm text-muted-foreground">{halted ? t("abc.whyHalted") : t("abc.whyActive")}</span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("more")} <Link href="/desk/crypto" className="font-semibold text-foreground underline underline-offset-2">{t("moreLink")}</Link>
      </p>
    </Panel>
  );
}
