"use client";

/**
 * The strategy lab on Desk → Scalp: every crypto strategy the desk has run or
 * researched, so a reader can tell at a glance what each one is and where it
 * stands. Each row leads with its id, a plain name, one sentence on what it
 * does and a status chip; the rules, holding time, universe, headline result
 * and lesson open under the row. Grouped by batch, newest first, with filters
 * for in progress / on paper / failed. Reads /api/crypto-desk/strategies.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import { cryptoApi, type LabStatus, type LabStrategy } from "@/modules/crypto/api";

const TONE: Record<LabStatus, ChipTone> = {
  live: "signal", paper: "signal", passed: "signal",
  preregistered: "protocol", awaiting_test: "protocol",
  halted: "caution", failed_design: "short", failed_test: "short",
};
type Filter = "all" | "active" | "paper" | "failed";
const IN: Record<Exclude<Filter, "all">, LabStatus[]> = {
  active: ["preregistered", "awaiting_test"],
  paper: ["paper", "live", "passed"],
  failed: ["failed_design", "failed_test", "halted"],
};

export function StrategyLab() {
  const t = useTranslations("scalp.lab");
  const ts = useTranslations("scalp");
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isError } = useQuery({ queryKey: ["crypto-strategies"], queryFn: () => cryptoApi.strategies(), staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, retry: 1 });

  const groups = useMemo(() => {
    if (!data) return [];
    const keep = (s: LabStrategy) => filter === "all" || IN[filter].includes(s.status);
    return data.batches
      .map((b) => ({ b, rows: data.strategies.filter((s) => s.batch === b.id && keep(s)) }))
      .filter((g) => g.rows.length);
  }, [data, filter]);

  if (isLoading) return <PanelPending label={t("label")} text={ts("loading")} />;
  if (isError || !data) return <PanelUnavailable label={t("label")} reason={t("unavailable")} />;

  const c = data.counts;
  const n = (ks: LabStatus[]) => ks.reduce((a, k) => a + (c[k] ?? 0), 0);
  const total = data.strategies.length;
  return (
    <Panel
      label={t("label")}
      qualifier={t("qualifier", { total })}
      reading={t("reading", { paper: n(IN.paper), open: n(IN.active), failed: n(IN.failed) })}
    >
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("label")}>
        {(["all", "active", "paper", "failed"] as const).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}
                tone={filter === f ? (f === "failed" ? "short" : f === "active" ? "protocol" : "signal") : "plain"}>
            {t(`filter.${f}`)} {f === "all" ? total : n(IN[f])}
          </Chip>
        ))}
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

      <div className="space-y-6">
        {groups.map(({ b, rows }) => (
          <section key={b.id} aria-labelledby={`lab-${b.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
              <h3 id={`lab-${b.id}`} className="card-title">{b.name}</h3>
              <span className="font-mono text-[11px] text-dim">{b.date} · {t("count", { n: rows.length })}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{b.note}</p>
            <ul className="mt-2 space-y-2">
              {rows.map((s) => <StrategyRow key={s.id} s={s} gate={b.gate} report={b.report} />)}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function StrategyRow({ s, gate, report }: { s: LabStrategy; gate?: string; report?: string }) {
  const t = useTranslations("scalp.lab");
  const failed = s.status === "failed_design" || s.status === "failed_test";
  return (
    <li>
      <details className="group rounded-control border border-border bg-background/40 open:bg-background">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <span className="mt-0.5 shrink-0 rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">{s.id}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`font-semibold ${failed ? "text-muted-foreground" : "text-foreground"}`}>{s.name}</span>
              <Chip tone={TONE[s.status]}>{t(`status.${s.status}`)}</Chip>
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">{s.what}</span>
            {s.result && <span className="mt-1 block break-words font-mono text-[11.5px] text-dim">{s.result}</span>}
          </span>
          <ChevronDown aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <dl className="grid gap-y-1.5 border-t border-border px-3 py-3 text-sm">
          <dt className="font-mono text-[11px] uppercase tracking-wide text-dim">{t("how")}</dt>
          <dd className="text-foreground">{s.how}</dd>
          <dt className="font-mono text-[11px] uppercase tracking-wide text-dim">{t("horizon")}</dt>
          <dd>{s.horizon}</dd>
          <dt className="font-mono text-[11px] uppercase tracking-wide text-dim">{t("universe")}</dt>
          <dd>{s.universe}</dd>
          {s.lesson && (
            <>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-dim">{t("lesson")}</dt>
              <dd className="text-muted-foreground">{s.lesson}</dd>
            </>
          )}
          {(gate || report) && (
            <>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-dim">{t("gate")}</dt>
              <dd className="break-all font-mono text-[11px] text-muted-foreground">{[gate, report].filter(Boolean).join(" · ")}</dd>
            </>
          )}
        </dl>
      </details>
    </li>
  );
}
