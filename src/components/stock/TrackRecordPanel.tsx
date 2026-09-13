"use client";

/**
 * TrackRecordPanel — you versus the engine, on the Desk.
 *
 * Answer first: your settled trades and win rate beside the engine's win
 * rate on the same strategy, what closing early has cost, and how the
 * engine's predicted probabilities held up on your trades. Then four
 * Stats. Under a Disclosure the expert view: every settled trade with the
 * engine's call that day, the agreement class and the hold-to-expiry
 * counterfactual, then cohorts by strategy, by agreement and by days to
 * expiry in the scorecard's own columns.
 *
 * `TrackRecordView` is the presentational half and takes the hook's state
 * as a prop, so it can be mounted on fixture data for a headless check.
 */
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat, { type StatTone } from "@/components/ui/Stat";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import Disclosure from "@/components/ui/Disclosure";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { useTrackRecord, type TrackRecordState } from "@/lib/useTrackRecord";
import type { Agreement, Block, GradedTrade } from "@/lib/trackRecord";

const MIN_TRADES = 5;
const AGREEMENT_TONE: Record<Agreement, ChipTone> = { same: "signal", same_other_strike: "protocol", different: "caution", none: "plain" };

const pct = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const pts = (gap: number) => `${gap > 0 ? "+" : ""}${(gap * 100).toFixed(1)}`;
const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function TrackRecordPanel({ strategy = "csp" }: { strategy?: "csp" | "covered_call" }) {
  const state = useTrackRecord();
  return <TrackRecordView state={state} strategy={strategy} />;
}

export function TrackRecordView({ state, strategy = "csp" }: { state: TrackRecordState; strategy?: "csp" | "covered_call" }) {
  const t = useTranslations("deskPanels.trackRecord");
  const label = t("label");
  const noun = strategy === "covered_call" ? t("nounCalls") : t("nounPuts");
  const engineKey = strategy === "covered_call" ? "sell_calls" : "sell_puts";

  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state.status !== "ready") return;
    if (typeof window !== "undefined" && window.location.hash === "#track-record") {
      setOpen(true);
      document.getElementById("track-record")?.scrollIntoView({ block: "start" });
    }
  }, [state.status]);

  const tradeColumns = useMemo<Column<GradedTrade>[]>(
    () => [
      { key: "ticker", header: t("col.ticker"), cell: (r) => <Link href={`/stock/${r.ticker}`} className="font-mono font-semibold text-signal hover:underline">{r.ticker}</Link> },
      { key: "strategy", header: t("col.strategy"), cell: (r) => <span className="text-xs">{t(`strategy.${r.strategy}` as never)}</span>, hideBelow: "sm" },
      { key: "expiry", header: t("col.expiry"), sortable: true, sortValue: (r) => r.expiry_date, cell: (r) => <span className="nums font-mono text-xs">{r.expiry_date.slice(0, 10)}</span> },
      { key: "strike", header: t("col.strike"), align: "right", cell: (r) => <span className="nums font-mono">{r.strike_price}</span> },
      {
        key: "engineStrike", header: t("col.engineStrike"), align: "right", optional: true,
        cell: (r) => <span className="nums font-mono text-muted-foreground">{r.engineStrike ?? "—"}</span>,
      },
      { key: "pop", header: t("col.pop"), ariaLabel: t("aria.pop"), align: "right", sortable: true, sortValue: (r) => r.pop, cell: (r) => <span className="nums font-mono">{pct(r.pop)}</span> },
      { key: "agreement", header: t("col.agreement"), cell: (r) => <Chip tone={AGREEMENT_TONE[r.agreement]}>{t(`agreement.${r.agreement}` as never)}</Chip> },
      { key: "outcome", header: t("col.outcome"), cell: (r) => <span className={r.won ? "text-signal-long" : "text-signal-short"}>{t(`status.${r.status}` as never)}</span>, hideBelow: "md" },
      {
        key: "pnl", header: t("col.pnl"), align: "right", sortable: true, sortValue: (r) => r.realized_pnl,
        cell: (r) => <span className={`nums font-mono ${(r.realized_pnl ?? 0) >= 0 ? "text-signal-long" : "text-signal-short"}`}>{r.realized_pnl == null ? "—" : usd(r.realized_pnl)}</span>,
      },
      {
        key: "hold", header: t("col.hold"), ariaLabel: t("aria.hold"), align: "right", optional: true,
        cell: (r) => <span className="nums font-mono text-muted-foreground">{r.holdPnl == null ? "—" : usd(r.holdPnl)}</span>,
      },
      {
        key: "delta", header: t("col.delta"), ariaLabel: t("aria.delta"), align: "right", sortable: true, sortValue: (r) => r.earlyCloseCost,
        cell: (r) => r.earlyCloseCost == null ? <span className="text-dim">—</span> : <span className={`nums font-mono ${r.earlyCloseCost > 0 ? "text-signal-caution" : "text-signal-long"}`}>{usd(-r.earlyCloseCost)}</span>,
      },
    ],
    [t],
  );

  if (state.status === "pending") return <PanelPending label={label} text={t("loading")} />;
  if (state.status === "signed_out") return <PanelUnavailable label={label} reason={t("signedOut")} />;
  const { summary: s, cohorts: c, engine } = state;
  if (!s || !c || s.settled === 0) {
    return <PanelUnavailable label={label} reason={state.openCount ? t("onlyOpen", { count: state.openCount }) : t("empty")} />;
  }

  const engineBlock = engine?.by_strategy?.[engineKey] ?? null;
  const enough = s.settled >= MIN_TRADES;

  const sentences: string[] = [];
  if (enough) sentences.push(t("lead", { settled: s.settled, won: s.won, winRate: pct(s.winRate) }));
  else sentences.push(t("fewLead", { settled: s.settled, won: s.won, min: MIN_TRADES }));
  if (engineBlock && engineBlock.n > 0) sentences.push(t("engineRate", { rate: pct(engineBlock.win_rate), noun, n: engineBlock.n }));
  else sentences.push(t("engineNone", { noun }));
  if (s.earlyClosed > 0 && s.earlyCloseCost != null) {
    sentences.push(t("early", { count: s.earlyClosed, word: s.earlyCloseCost > 0 ? t("earlyAdded") : t("earlySaved"), amount: usd(Math.abs(s.earlyCloseCost)) }));
  }
  if (s.matched >= 3 && s.meanPop != null && s.calibrationGap != null) {
    const delivered = s.meanPop - s.calibrationGap;
    sentences.push(t("calib", { matched: s.matched, pred: pct(s.meanPop), actual: pct(delivered), gap: pts(s.calibrationGap), word: s.calibrationGap > 0 ? t("optimistic") : t("conservative") }));
  }

  const cohortColumns: Column<{ key: string; label: string; b: Block }>[] = [
    { key: "cohort", header: t("cohort.cohort"), cell: (r) => <span className="text-foreground">{r.label}</span> },
    { key: "n", header: t("cohort.n"), align: "right", cell: (r) => <span className="nums font-mono">{r.b.n}</span> },
    { key: "won", header: t("cohort.won"), align: "right", cell: (r) => <span className="nums font-mono">{pct(r.b.win_rate)}</span> },
    { key: "captured", header: t("cohort.captured"), align: "right", hideBelow: "sm", cell: (r) => <span className="nums font-mono">{pct(r.b.avg_captured_pct)}</span> },
    { key: "ann", header: t("cohort.ann"), align: "right", hideBelow: "md", cell: (r) => <span className="nums font-mono">{pct(r.b.avg_annualized_pct, 1)}</span> },
    { key: "assigned", header: t("cohort.assigned"), align: "right", hideBelow: "md", cell: (r) => <span className="nums font-mono">{pct(r.b.assignment_rate)}</span> },
    { key: "predicted", header: t("cohort.predicted"), align: "right", cell: (r) => <span className="nums font-mono">{pct(r.b.mean_pop_pred)}</span> },
    { key: "gap", header: t("cohort.gap"), align: "right", cell: (r) => <span className={`nums font-mono ${r.b.calibration_gap == null ? "text-dim" : r.b.calibration_gap > 0.1 ? "text-signal-caution" : ""}`}>{r.b.calibration_gap == null ? "—" : pts(r.b.calibration_gap)}</span> },
  ];
  const rowsOf = (rec: Record<string, Block>, labelOf: (k: string) => string) =>
    Object.entries(rec).filter(([, b]) => b.n > 0).map(([k, b]) => ({ key: k, label: labelOf(k), b }));
  const engineRows = engine ? [{ key: "engine", label: t("cohort.engineRow", { noun }), b: engineBlock ?? { n: 0, win_rate: null, avg_captured_pct: null, avg_annualized_pct: null, assignment_rate: null, mean_pop_pred: null, calibration_gap: null } }] : [];

  const gapTone: StatTone = s.calibrationGap == null ? "muted" : Math.abs(s.calibrationGap) <= 0.1 ? "plain" : "caution";

  return (
    <>
      <div id="track-record" className="scroll-mt-24">
        <Panel label={label} qualifier={t("qualifier", { count: s.settled })} reading={t("reading")}>
          <p className="text-[15px] leading-relaxed text-foreground">{sentences.join(" ")}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("stat.yours")} value={enough ? pct(s.winRate) : `${s.won}/${s.settled}`} sub={enough ? t("stat.yoursSub", { won: s.won, settled: s.settled }) : t("stat.yoursFew", { min: MIN_TRADES })} />
            <Stat label={t("stat.engine")} value={engineBlock && engineBlock.n ? pct(engineBlock.win_rate) : "—"} sub={engineBlock && engineBlock.n ? t("stat.engineSub", { n: engineBlock.n, noun }) : t("stat.engineNone")} tone={engineBlock && engineBlock.n ? "plain" : "muted"} />
            <Stat label={t("stat.gap")} value={s.calibrationGap == null ? "—" : pts(s.calibrationGap)} sub={s.calibrationGap == null ? t("stat.gapNone") : t("stat.gapSub", { matched: s.matched })} tone={gapTone} />
            {/* Shown as the effect of closing early against holding: a
                positive figure is money the early close kept. */}
            <Stat
              label={t("stat.early")}
              value={s.earlyCloseCost == null ? "—" : usd(-s.earlyCloseCost)}
              sub={
                s.earlyCloseCost == null
                  ? t("stat.earlyNone")
                  : s.earlyCloseCost > 0
                    ? t("stat.earlyCost", { count: s.earlyClosed })
                    : t("stat.earlySaved", { count: s.earlyClosed })
              }
              tone={s.earlyCloseCost == null ? "muted" : s.earlyCloseCost > 0 ? "caution" : "long"}
            />
          </div>
        </Panel>
      </div>

      <Disclosure label={t("detailLabel")} qualifier={t("detailQualifier")} open={open}>
        <div className="space-y-6">
          <DataTable
            caption={t("tableCaption")}
            columns={tradeColumns}
            rows={state.graded}
            rowKey={(r) => String(r.id)}
            defaultSort={{ key: "expiry", dir: "desc" }}
            countLabel={(n) => t("countLabel", { count: n })}
          />
          <section>
            <div className="card-title mb-2">{t("cohort.byStrategy")}</div>
            <DataTable caption={t("cohort.byStrategy")} columns={cohortColumns} rowKey={(r) => r.key}
              rows={[...rowsOf(c.byStrategy, (k) => t(`strategy.${k}` as never)), ...engineRows]}
              rowClassName={(r) => (r.key === "engine" ? "bg-muted/40" : undefined)} />
          </section>
          <section>
            <div className="card-title mb-2">{t("cohort.byAgreement")}</div>
            <DataTable caption={t("cohort.byAgreement")} columns={cohortColumns} rowKey={(r) => r.key} rows={rowsOf(c.byAgreement, (k) => t(`agreement.${k}` as never))} />
          </section>
          <section>
            <div className="card-title mb-2">{t("cohort.byDte")}</div>
            <DataTable caption={t("cohort.byDte")} columns={cohortColumns} rowKey={(r) => r.key} rows={rowsOf(c.byDte, (k) => k)} />
          </section>
        </div>
      </Disclosure>
    </>
  );
}
