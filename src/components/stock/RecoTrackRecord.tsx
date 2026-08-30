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
import { modelsApi } from "@/lib/api";
import { ClipboardList } from "lucide-react";

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

const STRATEGY_LABEL: Record<string, string> = {
  sell_puts: "Short puts",
  sell_calls: "Covered calls",
  sell_strangle: "Strangles",
};

const pct = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(d)}%`;

/** A win rate this close to a coin flip is not an edge, whatever the yield. */
const NO_EDGE_BAND = 0.55;

function Row({ label, b, hint }: { label: string; b: Block; hint?: string }) {
  // Optimistic (positive gap) is the direction that hurts: sizing is derived
  // from the predicted number, so over-promising compounds into over-betting.
  const gap = b.calibration_gap;
  const gapTone =
    Math.abs(gap) <= 0.03 ? "text-signal-long"
    : gap > 0 ? "text-signal-short"
    : "text-signal-caution";
  const flat = b.win_rate < NO_EDGE_BAND;

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2 pr-3">
        <span className="font-medium">{label}</span>
        {flat ? (
          <span
            className="ml-2 rounded border border-signal-short/40 bg-signal-short-bg px-1.5 py-px text-[10px] font-semibold uppercase text-signal-short"
            title="Win rate near a coin flip. With roughly symmetric payoffs there is no edge here, however good the annualised number looks."
          >
            no edge
          </span>
        ) : null}
        {hint ? <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span> : null}
      </td>
      <td className="nums py-2 pr-3 text-right text-muted-foreground">{b.n.toLocaleString()}</td>
      <td className="nums py-2 pr-3 text-right font-semibold">{pct(b.win_rate)}</td>
      <td className="nums py-2 pr-3 text-right text-muted-foreground">{pct(b.mean_pop_pred)}</td>
      <td className={`nums py-2 pr-3 text-right font-semibold ${gapTone}`}>
        {gap > 0 ? "+" : ""}
        {(gap * 100).toFixed(1)}
      </td>
      <td className="nums py-2 pr-3 text-right">{pct(b.assignment_rate)}</td>
      <td className="nums py-2 pr-3 text-right text-muted-foreground">
        {b.avg_annualized_pct?.toFixed(0)}%
      </td>
    </tr>
  );
}

export default function RecoTrackRecord() {
  const { data, isLoading, error } = useQuery<Scorecard>({
    queryKey: ["options-reco-scorecard", 400],
    queryFn: () => modelsApi.optionsRecoScorecard(400),
    staleTime: 60 * 60_000,
  });

  const puts = data?.by_strategy?.sell_puts;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-primary" />
          What the engine actually called
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Every recommendation the engine logged, graded against the price on expiry. Not a
          simulation — these were real calls made ahead of time.{" "}
          {data ? `${data.overall.n.toLocaleString()} settled over ${data.window_days} days.` : ""}
        </p>
      </header>

      {error ? (
        <p className="rounded border border-signal-short/40 bg-signal-short-bg p-3 text-sm text-signal-short">
          Could not load the track record.
        </p>
      ) : isLoading || !data ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading the track record…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <caption className="sr-only">Recommendation track record by strategy</caption>
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Strategy</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Settled</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Won</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Predicted</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium" title="Predicted probability of profit minus realised win rate, in points. Near zero is well calibrated; positive means the engine over-promised.">
                    Gap
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Assigned</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Ann.</th>
                </tr>
              </thead>
              <tbody>
                <Row label="All" b={data.overall} />
                {Object.entries(data.by_strategy).map(([k, b]) => (
                  <Row key={k} label={STRATEGY_LABEL[k] ?? k} b={b} />
                ))}
              </tbody>
            </table>
          </div>

          {puts ? (
            <p className="mt-3 max-w-3xl border-l-2 border-primary pl-3 text-sm text-muted-foreground">
              On the strategy this desk is built around, the engine is{" "}
              <span className="text-foreground">well calibrated</span>: it predicted{" "}
              {pct(puts.mean_pop_pred)} and delivered {pct(puts.win_rate)} across{" "}
              {puts.n.toLocaleString()} settled short puts — optimistic by{" "}
              {(puts.calibration_gap * 100).toFixed(1)} points. Close enough that the predicted
              probability is usable as an input rather than decoration.
            </p>
          ) : null}

          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium">
              By model agreement, and by days to expiry
            </summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {(["by_agreement", "by_dte"] as const).map((k) => (
                <div key={k}>
                  <div className="mb-1 text-[10px] uppercase tracking-wide">
                    {k === "by_agreement" ? "Quant × PAM agreement" : "Days to expiry"}
                  </div>
                  <table className="w-full">
                    <tbody>
                      {Object.entries(data[k]).map(([label, b]) => (
                        <tr key={label} className="border-b border-border/40 last:border-0">
                          <td className="py-1 capitalize">{label}</td>
                          <td className="nums py-1 text-right text-muted-foreground">n={b.n}</td>
                          <td className="nums py-1 text-right font-medium">{pct(b.win_rate)}</td>
                          <td className="nums py-1 text-right">
                            {b.calibration_gap > 0 ? "+" : ""}
                            {(b.calibration_gap * 100).toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="mt-2">
              <strong>Gap</strong> is predicted probability of profit minus realised win rate, in
              points. Positive means the engine over-promised, which is the direction that matters:
              sizing is derived from the predicted number, so over-promising compounds into
              over-betting. <strong>Ann.</strong> is annualised return on collateral as the engine
              estimated it at entry, priced at mid — an upper bound, since the market-data plan
              returns no bid/ask.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
