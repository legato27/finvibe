"use client";

/**
 * The engine's own track record — every recommendation it made, graded against
 * what the price actually did.
 *
 * This is the only backward-looking evidence on the desk that involves real
 * recommendations rather than simulated entries. The assignment backtest asks
 * "what would this strategy have done"; this asks "what did THIS engine
 * actually call, and was it right". They answer different questions and both
 * belong on the page.
 *
 * The number to read first is the CALIBRATION GAP: predicted probability of
 * profit minus the realised win rate. A well-calibrated engine sits near zero.
 * Positive means it was optimistic — it promised more wins than it delivered —
 * and that is the failure mode that matters for a premium seller, because
 * position sizing is derived from the predicted number.
 *
 * A strategy row with a win rate near 50% and symmetric payoffs has no edge,
 * however good its annualised figure looks. Short strangles are the live
 * example and the largest block in the log, which is exactly why this is worth
 * showing rather than leaving in a database.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { modelsApi } from "@/lib/api";
import { ClipboardList } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";

interface Block {
  n: number;
  win_rate: number;
  avg_captured_pct: number;
  avg_annualized_pct: number;
  assignment_rate: number;
  mean_pop_pred: number;
  calibration_gap: number;
}

interface Scorecard {
  window_days: number;
  overall: Block;
  by_strategy: Record<string, Block>;
  by_agreement: Record<string, Block>;
  by_dte: Record<string, Block>;
  latest_review?: string | null;
  review_at?: string | null;
}

const STRATEGY_KEYS = ["sell_puts", "sell_calls", "sell_strangle"] as const;
type StrategyKey = (typeof STRATEGY_KEYS)[number];
const isStrategyKey = (s: string): s is StrategyKey => (STRATEGY_KEYS as readonly string[]).includes(s);

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(d)}%`;

const signedPts = (gap: number) => `${gap > 0 ? "+" : ""}${(gap * 100).toFixed(1)}`;

/** A win rate this close to a coin flip is not an edge, whatever the yield. */
const NO_EDGE_BAND = 0.55;

type TrackRow = { key: string; label: string; b: Block };
type BreakdownRow = { label: string; b: Block };

export default function RecoTrackRecord({
  strategy = "csp",
}: {
  /** Which desk this is under, so the callout reads the matching strategy
   *  block rather than always narrating short puts. */
  strategy?: "csp" | "covered_call";
} = {}) {
  const t = useTranslations("deskPanels.recoTrackRecord");
  const { data, isLoading, error } = useQuery<Scorecard>({
    queryKey: ["options-reco-scorecard", 400],
    queryFn: () => modelsApi.optionsRecoScorecard(400),
    staleTime: 60 * 60_000,
  });

  const focusKey = strategy === "covered_call" ? "sell_calls" : "sell_puts";
  const focus = data?.by_strategy?.[focusKey];
  const focusNoun = strategy === "covered_call" ? t("nounCalls") : t("nounPuts");
  // The gap is predicted minus realised, so its SIGN is the finding: positive
  // means the engine over-promised, negative that it under-promised. Calling
  // it "optimistic" unconditionally was only ever right for puts.
  const gapPts = focus ? Math.abs(focus.calibration_gap * 100) : 0;
  const gapWord = focus && focus.calibration_gap > 0 ? t("optimistic") : t("conservative");
  const calibrated = gapPts < 5;

  const label = (
    <>
      <ClipboardList className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
      {t("label")}
    </>
  );

  if (error) {
    return <PanelUnavailable label={label} reason={t("unavailable")} />;
  }
  if (isLoading || !data) {
    return <PanelPending label={label} text={t("loading")} />;
  }

  const rows: TrackRow[] = [
    { key: "all", label: t("all"), b: data.overall },
    ...Object.entries(data.by_strategy).map(([k, b]) => ({
      key: k,
      label: isStrategyKey(k) ? t(`strategy.${k}`) : k,
      b,
    })),
    // Options only. The crypto scalp family used to be appended here as
    // three more cohorts with a paper badge; it has its own engine record on
    // the scalp desk now (a scalp's "captured" is an R multiple and its
    // "assigned" a stop rate — not the same table).
  ];

  const columns: Column<TrackRow>[] = [
    {
      key: "strategy",
      header: t("col.strategy"),
      sortable: true,
      sortValue: (r) => r.label,
      cell: (r) => (
        <span>
          <span className="font-medium">{r.label}</span>
          {r.b.win_rate < NO_EDGE_BAND ? (
            <span
              className="ml-2 rounded border border-signal-short/40 bg-signal-short-bg px-1.5 py-px text-[10px] font-semibold uppercase text-signal-short"
              title={t("noEdgeTitle")}
            >
              {t("noEdge")}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "settled",
      header: t("col.settled"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.n,
      cell: (r) => <span className="nums text-muted-foreground">{r.b.n.toLocaleString()}</span>,
    },
    {
      key: "won",
      header: t("col.won"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.win_rate,
      cell: (r) => <span className="nums font-semibold">{pct(r.b.win_rate)}</span>,
    },
    {
      key: "predicted",
      header: t("col.predicted"),
      ariaLabel: t("aria.predicted"),
      sortable: true,
      align: "right",
      hideBelow: "md",
      sortValue: (r) => r.b.mean_pop_pred,
      cell: (r) => <span className="nums text-muted-foreground">{pct(r.b.mean_pop_pred)}</span>,
    },
    {
      key: "gap",
      header: <span title={t("gapTitle")}>{t("col.gap")}</span>,
      ariaLabel: t("aria.gap"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.calibration_gap,
      cell: (r) => {
        // Optimistic (positive gap) is the direction that hurts: sizing is
        // derived from the predicted number, so over-promising compounds into
        // over-betting.
        const gap = r.b.calibration_gap;
        const tone =
          Math.abs(gap) <= 0.03 ? "text-signal-long"
          : gap > 0 ? "text-signal-short"
          : "text-signal-caution";
        return <span className={`nums font-semibold ${tone}`}>{signedPts(gap)}</span>;
      },
    },
    {
      key: "assigned",
      header: t("col.assigned"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.assignment_rate,
      cell: (r) => <span className="nums">{pct(r.b.assignment_rate)}</span>,
    },
    {
      key: "ann",
      header: t("col.ann"),
      ariaLabel: t("aria.ann"),
      sortable: true,
      align: "right",
      hideBelow: "lg",
      sortValue: (r) => r.b.avg_annualized_pct,
      cell: (r) => (
        <span className="nums text-muted-foreground">{r.b.avg_annualized_pct?.toFixed(0)}%</span>
      ),
    },
  ];

  const breakdownColumns = (labelHeader: string): Column<BreakdownRow>[] => [
    {
      key: "label",
      header: labelHeader,
      sortable: true,
      sortValue: (r) => r.label,
      cell: (r) => <span className="capitalize">{r.label}</span>,
    },
    {
      key: "n",
      header: t("breakdown.settled"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.n,
      cell: (r) => <span className="nums text-muted-foreground">{r.b.n.toLocaleString()}</span>,
    },
    {
      key: "won",
      header: t("breakdown.won"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.win_rate,
      cell: (r) => <span className="nums font-medium">{pct(r.b.win_rate)}</span>,
    },
    {
      key: "gap",
      header: t("breakdown.gap"),
      ariaLabel: t("aria.gap"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.b.calibration_gap,
      cell: (r) => <span className="nums">{signedPts(r.b.calibration_gap)}</span>,
    },
  ];

  const toRows = (block: Record<string, Block>): BreakdownRow[] =>
    Object.entries(block).map(([label, b]) => ({ label, b }));

  const reading = focus
    ? t.rich("reading", {
        hl: (chunks) => <span className="text-foreground">{chunks}</span>,
        verdict: calibrated ? t("calibrated") : t("poorlyCalibrated"),
        predicted: pct(focus.mean_pop_pred),
        won: pct(focus.win_rate),
        count: focus.n.toLocaleString(),
        noun: focusNoun,
        word: gapWord,
        points: gapPts.toFixed(1),
        conclusion: calibrated ? t("closeEnough") : t("farOut"),
      })
    : undefined;

  return (
    <Panel
      label={label}
      qualifier={t("qualifier", { count: data.overall.n.toLocaleString(), days: data.window_days })}
      reading={reading}
    >
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">{t("lead")}</p>

      <DataTable<TrackRow>
        caption={t("tableCaption")}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
      />

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium">{t("breakdown.summary")}</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <DataTable<BreakdownRow>
            caption={t("breakdown.captionAgreement")}
            columns={breakdownColumns(t("breakdown.byAgreement"))}
            rows={toRows(data.by_agreement)}
            rowKey={(r) => r.label}
          />
          <DataTable<BreakdownRow>
            caption={t("breakdown.captionDte")}
            columns={breakdownColumns(t("breakdown.byDte"))}
            rows={toRows(data.by_dte)}
            rowKey={(r) => r.label}
          />
        </div>
        <p className="mt-2">{t.rich("footnote", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
      </details>
    </Panel>
  );
}
