"use client";

/**
 * Tier-1 assignment backtest — the cohort comparison.
 *
 * This answers the question the desk is actually built around: if I get
 * assigned, can I live with it? Not "what would this have earned" — there are
 * no historical option prices in the system, so any P&L here would be
 * Black-Scholes stacked on a volatility guess. Everything below is a path fact
 * measured from five years of daily candles.
 *
 * The comparison IS the output. A single assignment rate says little; the
 * useful thing is that entering after weakness barely moves assignment (23.4%
 * to 17.3%) while nearly doubling the return on the shares you end up holding
 * (+0.2% to +11.1%). That is the desk's entry filter earning its place, and it
 * is not visible without the baseline sitting next to it.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { optionsApi } from "@/lib/api";
import { FlaskConical, Info } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Segmented from "@/components/ui/Segmented";

interface Cohort {
  label: string;
  n: number;
  assignment_rate: number;
  touch_rate: number;
  mean_adverse_excursion: number;
  p95_adverse_excursion: number;
  mean_loss_given_assignment: number | null;
  recovery_rate: number | null;
  mean_hold_return: number | null;
  median_days_to_recover: number | null;
  n_assigned: number;
}

interface BacktestResponse {
  params: { dte: number; delta: number; type: string; years: number; vrp: number };
  as_of: string;
  n_trials: number;
  n_names: number;
  overall: Cohort | null;
  cohorts: Record<string, Cohort>;
  cached: boolean;
  note: string;
}

type PresetId = "p30" | "p7" | "c30";

const PRESETS: Array<{ id: PresetId; dte: number; delta: number; type: "put" | "call" }> = [
  { id: "p30", dte: 30, delta: 0.25, type: "put" },
  { id: "p7", dte: 7, delta: 0.13, type: "put" },
  { id: "c30", dte: 30, delta: 0.25, type: "call" },
];

/** API cohort key → message key. Unknown cohorts fall back to the raw key. */
const COHORT_KEY: Record<string, "all" | "below1" | "below2" | "above1"> = {
  all: "all",
  "ou_z_below_-1": "below1",
  "ou_z_below_-2": "below2",
  "ou_z_above_+1": "above1",
};

type CohortRow = { key: string; c: Cohort };

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(d)}%`;

/** Horizontal magnitude bar. Width is relative to the worst value in the set. */
function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const w = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <span className="mt-1 block h-1 w-full bg-muted" aria-hidden="true">
      <span className={`block h-full ${tone}`} style={{ width: `${w}%` }} />
    </span>
  );
}

const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

export default function AssignmentBacktest({
  strategy = "csp",
}: {
  /** Which desk this is sitting under. A covered-call desk must not open on
   *  put assignment stats — that is the other side of the trade. */
  strategy?: "csp" | "covered_call";
} = {}) {
  const t = useTranslations("deskPanels.assignmentBacktest");
  const [preset, setPreset] = useState(
    () => PRESETS.find((x) => x.type === (strategy === "covered_call" ? "call" : "put")) ?? PRESETS[0],
  );

  // The desk's strategy switch is a different control from this panel's preset
  // buttons, but flipping the desk should still move this off the wrong side.
  const wantType = strategy === "covered_call" ? "call" : "put";
  useEffect(() => {
    setPreset((cur) =>
      cur.type === wantType ? cur : PRESETS.find((x) => x.type === wantType) ?? cur,
    );
  }, [wantType]);

  const { data, isLoading, error } = useQuery<BacktestResponse>({
    queryKey: ["assignment-backtest", preset.id],
    queryFn: () => optionsApi.assignmentBacktest(preset.dte, preset.delta, preset.type),
    staleTime: 60 * 60_000,
  });

  const cohorts: CohortRow[] = data ? Object.entries(data.cohorts).map(([key, c]) => ({ key, c })) : [];
  const isPut = preset.type === "put";
  const maxAssign = Math.max(0.001, ...cohorts.map(({ c }) => c.assignment_rate));
  const baseline = data?.cohorts?.all;
  const below2 = data?.cohorts?.["ou_z_below_-2"];

  const label = (
    <>
      <FlaskConical className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
      {t("label")}
    </>
  );

  const aside = (
    <Segmented<PresetId>
      size="sm"
      mode="toggle"
      ariaLabel={t("presetsLabel")}
      value={preset.id}
      onChange={(id) => setPreset(PRESETS.find((p) => p.id === id) ?? PRESETS[0])}
      options={PRESETS.map((p) => ({ value: p.id, label: t(`preset.${p.id}`) }))}
    />
  );

  if (error) {
    return <PanelUnavailable label={label} aside={aside} reason={t("unavailable")} />;
  }
  if (isLoading || !data) {
    return <PanelPending label={label} text={t("loading")} />;
  }

  const columns: Column<CohortRow>[] = [
    {
      key: "condition",
      header: t("col.condition"),
      cell: ({ key }) => {
        const isBase = key === "all";
        const mk = COHORT_KEY[key];
        return (
          <span>
            <span className={isBase ? "font-semibold" : ""}>{mk ? t(`cohort.${mk}`) : key}</span>
            {isBase ? (
              <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">{t("baseline")}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "entries",
      header: t("col.entries"),
      sortable: true,
      align: "right",
      sortValue: ({ c }) => c.n,
      cell: ({ c }) => <span className="nums text-muted-foreground">{c.n.toLocaleString()}</span>,
    },
    {
      key: "assigned",
      header: isPut ? t("col.assigned") : t("col.calledAway"),
      sortable: true,
      align: "right",
      sortValue: ({ c }) => c.assignment_rate,
      cell: ({ c }) => (
        <span className="nums block font-semibold">
          {pct(c.assignment_rate)}
          <Bar value={c.assignment_rate} max={maxAssign} tone="bg-signal-short" />
        </span>
      ),
    },
    {
      key: "touched",
      header: t("col.touched"),
      sortable: true,
      align: "right",
      hideBelow: "md",
      sortValue: ({ c }) => c.touch_rate,
      cell: ({ c }) => <span className="nums text-muted-foreground">{pct(c.touch_rate)}</span>,
    },
    {
      key: "worst",
      header: t("col.worst"),
      ariaLabel: t("aria.worst"),
      sortable: true,
      align: "right",
      sortValue: ({ c }) => c.p95_adverse_excursion,
      cell: ({ c }) => <span className="nums text-signal-short">{pct(c.p95_adverse_excursion)}</span>,
    },
    ...(isPut
      ? ([
          {
            key: "recovered",
            header: t("col.recovered"),
            sortable: true,
            align: "right",
            hideBelow: "lg",
            sortValue: ({ c }) => c.recovery_rate,
            cell: ({ c }) => <span className="nums">{pct(c.recovery_rate)}</span>,
          },
          {
            key: "hold",
            header: t("col.hold"),
            ariaLabel: t("aria.hold"),
            sortable: true,
            align: "right",
            sortValue: ({ c }) => c.mean_hold_return,
            cell: ({ c }) => (
              <span
                className={`nums font-semibold ${
                  (c.mean_hold_return ?? 0) > 0.02 ? "text-signal-long" : "text-muted-foreground"
                }`}
              >
                {pct(c.mean_hold_return)}
              </span>
            ),
          },
        ] as Column<CohortRow>[])
      : []),
  ];

  return (
    <Panel
      label={label}
      qualifier={t("qualifier", { trials: data.n_trials.toLocaleString(), names: data.n_names })}
      aside={aside}
      reading={t("reading")}
    >
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
        {t("lead", { trials: data.n_trials.toLocaleString(), names: data.n_names })}
      </p>

      <DataTable<CohortRow>
        caption={t("tableCaption")}
        columns={columns}
        rows={cohorts}
        rowKey={(r) => r.key}
        rowClassName={(r) => (r.key === "all" ? "bg-muted/40" : undefined)}
      />

      {/* The finding, stated — a table of four rows should not require the
          reader to derive the conclusion themselves. */}
      {isPut && baseline && below2 ? (
        <p className="mt-3 max-w-3xl border-l-2 border-signal pl-3 text-sm text-muted-foreground">
          {t.rich("finding", {
            hl: (chunks) => <span className="text-foreground">{chunks}</span>,
            good: (chunks) => <span className="font-semibold text-signal-long">{chunks}</span>,
            baseAssign: pct(baseline.assignment_rate),
            cohortAssign: pct(below2.assignment_rate),
            baseRecover: pct(baseline.recovery_rate),
            cohortRecover: pct(below2.recovery_rate),
            baseHold: pct(baseline.mean_hold_return),
            cohortHold: pct(below2.mean_hold_return),
            share: baseline.n > 0 ? `${((below2.n / baseline.n) * 100).toFixed(1)}%` : "—",
          })}
        </p>
      ) : null}

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium">
          <Info className="mr-1 inline h-3 w-3" aria-hidden="true" />
          {t("glossary.summary")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{t.rich("glossary.assigned", { strong })}</li>
          <li>{t.rich("glossary.touched", { strong })}</li>
          <li>{t.rich("glossary.worst", { strong })}</li>
          <li>{t.rich("glossary.recovered", { strong })}</li>
          <li>{t.rich("glossary.hold", { strong })}</li>
          <li className="pt-1">{t.rich("glossary.noProfit", { strong, vrp: data.params.vrp })}</li>
          <li>{t.rich("glossary.noFundamentals", { strong })}</li>
        </ul>
      </details>
    </Panel>
  );
}
