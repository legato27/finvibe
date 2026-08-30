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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { optionsApi } from "@/lib/api";
import { FlaskConical, Info } from "lucide-react";

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

const PRESETS = [
  { id: "p30", label: "30 DTE puts", dte: 30, delta: 0.25, type: "put" as const },
  { id: "p7", label: "7 DTE puts", dte: 7, delta: 0.13, type: "put" as const },
  { id: "c30", label: "30 DTE calls", dte: 30, delta: 0.25, type: "call" as const },
];

const COHORT_LABEL: Record<string, string> = {
  all: "Every entry",
  "ou_z_below_-1": "Entered 1σ below",
  "ou_z_below_-2": "Entered 2σ below",
  "ou_z_above_+1": "Entered 1σ above",
};

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

export default function AssignmentBacktest() {
  const [preset, setPreset] = useState(PRESETS[0]);

  const { data, isLoading, error } = useQuery<BacktestResponse>({
    queryKey: ["assignment-backtest", preset.id],
    queryFn: () => optionsApi.assignmentBacktest(preset.dte, preset.delta, preset.type),
    staleTime: 60 * 60_000,
  });

  const cohorts = data ? Object.entries(data.cohorts) : [];
  const isPut = preset.type === "put";
  const maxAssign = Math.max(0.001, ...cohorts.map(([, c]) => c.assignment_rate));
  const baseline = data?.cohorts?.all;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FlaskConical className="h-4 w-4 text-primary" />
            If I get assigned, can I live with it?
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Five years of daily candles, {data ? data.n_trials.toLocaleString() : "—"} simulated
            entries across {data?.n_names ?? "—"} names. Strikes are inverted from delta using the
            volatility known at the time — no future information, and no option prices, so there is
            no profit figure here on purpose.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={preset.id === p.id}
              className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                preset.id === p.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p className="rounded border border-signal-short/40 bg-signal-short-bg p-3 text-sm text-signal-short">
          Could not run the backtest. The analytics box may be unreachable.
        </p>
      ) : isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Running ~90,000 simulated entries…
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">
                Assignment outcomes by entry condition
              </caption>
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Entry condition</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Entries</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {isPut ? "Assigned" : "Called away"}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Touched</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Worst 5%</th>
                  {isPut ? (
                    <>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Recovered</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Shares +63d</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {cohorts.map(([key, c]) => {
                  const isBase = key === "all";
                  return (
                    <tr
                      key={key}
                      className={`border-b border-border/60 last:border-0 ${
                        isBase ? "bg-muted/40" : ""
                      }`}
                    >
                      <td className="py-2.5 pr-3">
                        <span className={isBase ? "font-semibold" : ""}>
                          {COHORT_LABEL[key] ?? key}
                        </span>
                        {isBase ? (
                          <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                            baseline
                          </span>
                        ) : null}
                      </td>
                      <td className="nums py-2.5 pr-3 text-right text-muted-foreground">
                        {c.n.toLocaleString()}
                      </td>
                      <td className="nums py-2.5 pr-3 text-right font-semibold">
                        {pct(c.assignment_rate)}
                        <Bar value={c.assignment_rate} max={maxAssign} tone="bg-signal-short" />
                      </td>
                      <td className="nums py-2.5 pr-3 text-right text-muted-foreground">
                        {pct(c.touch_rate)}
                      </td>
                      <td className="nums py-2.5 pr-3 text-right text-signal-short">
                        {pct(c.p95_adverse_excursion)}
                      </td>
                      {isPut ? (
                        <>
                          <td className="nums py-2.5 pr-3 text-right">{pct(c.recovery_rate)}</td>
                          <td
                            className={`nums py-2.5 pr-3 text-right font-semibold ${
                              (c.mean_hold_return ?? 0) > 0.02
                                ? "text-signal-long"
                                : "text-muted-foreground"
                            }`}
                          >
                            {pct(c.mean_hold_return)}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* The finding, stated — a table of four rows should not require the
              reader to derive the conclusion themselves. */}
          {isPut && baseline && data?.cohorts?.["ou_z_below_-2"] ? (
            <p className="mt-3 max-w-3xl border-l-2 border-primary pl-3 text-sm text-muted-foreground">
              Entering after weakness barely changes how often you are assigned —{" "}
              <span className="text-foreground">
                {pct(baseline.assignment_rate)} to{" "}
                {pct(data.cohorts["ou_z_below_-2"].assignment_rate)}
              </span>
              . What it changes is what assignment feels like: shares recover within 63 days{" "}
              <span className="text-foreground">
                {pct(baseline.recovery_rate)} → {pct(data.cohorts["ou_z_below_-2"].recovery_rate)}
              </span>{" "}
              of the time, and their return goes{" "}
              <span className="text-signal-long font-semibold">
                {pct(baseline.mean_hold_return)} →{" "}
                {pct(data.cohorts["ou_z_below_-2"].mean_hold_return)}
              </span>
              . The cost is opportunity: that cohort is{" "}
              {baseline.n > 0
                ? `${((data.cohorts["ou_z_below_-2"].n / baseline.n) * 100).toFixed(1)}%`
                : "—"}{" "}
              of all entries.
            </p>
          ) : null}

          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium">
              <Info className="mr-1 inline h-3 w-3" />
              What these columns mean, and what this does not measure
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Assigned</strong> — finished in the money; the shares change hands.</li>
              <li><strong>Touched</strong> — traded through the strike at some point. It runs at roughly twice the assignment rate, which is the standard probability-of-touch relationship and a check that the model is behaving.</li>
              <li><strong>Worst 5%</strong> — the 5th-percentile excursion past the strike while the contract was open. This is what position sizing has to survive, not the average.</li>
              <li><strong>Recovered</strong> — of the assigned trades, how often the shares got back above the strike within 63 trading days.</li>
              <li><strong>Shares +63d</strong> — average return on the assigned shares, measured from the strike.</li>
              <li className="pt-1">
                <strong>No profit figure.</strong> Historical per-strike option prices were never stored, so a P&amp;L here would be a model on top of a volatility guess. Strikes come from inverting Black-Scholes delta with a {data?.params.vrp}× volatility-premium multiplier.
              </li>
              <li>
                <strong>No fundamental filters.</strong> F-Score and Altman are stored as current values only. Applying today&apos;s scores to a 2022 entry would select companies that turned out fine and make these numbers look considerably better than the strategy is.
              </li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
