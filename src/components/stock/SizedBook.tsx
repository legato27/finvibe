"use client";

/**
 * The collateral-budget book — what you can actually hold, not what ranks.
 *
 * A ranked table quietly implies you can take all of it. For cash-secured puts
 * that is never true: every position ties up strike × 100 per contract until
 * expiry, so a normal account holds five to fifteen, and which five is a
 * different question from which five score highest.
 *
 * Two things this surfaces that the ranking cannot:
 *
 *  - Concentration by CORRELATION BUCKET rather than sector. Eight bitcoin
 *    miners are filed under Financials and move as one position; a sector cap
 *    would wave all of them through.
 *  - Names that ranked well and are simply unaffordable. One SPY put at a 700
 *    strike is $70,000. On a $100k book that breaches any sane per-name cap
 *    whatever it scores, and "you cannot afford this" is a different fact from
 *    "this did not qualify".
 */
import { useState } from "react";
import { Wallet, TriangleAlert } from "lucide-react";

export interface BookPosition {
  ticker: string;
  name: string | null;
  bucket: string;
  sector_raw: string | null;
  score: number;
  strike: number;
  dte: number | null;
  expiry_date: string | null;
  contracts: number;
  collateral: number;
  collateral_pct: number;
  credit_est: number | null;
  annualized_return_pct: number | null;
  iv_percentile: number | null;
  next_earnings_date: string | null;
}

export interface Book {
  collateral: number;
  deployed: number;
  utilisation: number;
  cash_free: number;
  n_positions: number;
  credit_est_total: number;
  credit_yield_on_budget_pct: number;
  caps: {
    max_name_pct: number;
    max_bucket_pct: number;
    max_positions: number;
    name_cap_usd: number;
    bucket_cap_usd: number;
  };
  by_bucket: Record<string, { collateral: number; pct: number }>;
  positions: BookPosition[];
  skipped: Array<{ ticker: string; bucket?: string; reason: string; unaffordable?: boolean }>;
}

const usd = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function SizedBook({
  book,
  collateral,
  onCollateralChange,
}: {
  book: Book | null;
  collateral: number | null;
  onCollateralChange: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(collateral ? String(collateral) : "");

  const apply = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    onCollateralChange(Number.isFinite(n) && n > 0 ? n : null);
  };

  const unaffordable = (book?.skipped ?? []).filter((s) => s.unaffordable);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="h-4 w-4 text-primary" />
            What fits in the book
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Cash-secured puts tie up strike × 100 per contract. Enter the cash you would commit and
            the desk allocates it breadth-first — every name gets its first contract before any gets
            a second — under a per-name and per-correlation-bucket cap.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-[11px] uppercase tracking-wide text-muted-foreground">
            Collateral
            <input
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={apply}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder="100000"
              aria-label="Collateral available, in dollars"
              className="mt-1 w-36 rounded border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums"
            />
          </label>
          <button
            type="button"
            onClick={apply}
            className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          >
            Size it
          </button>
        </div>
      </header>

      {!book ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Enter your collateral to see the book. Without it the desk is a ranking only — which is
          the honest default, since the book depends on cash the desk cannot know.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-4">
            {[
              { k: "Deployed", v: usd(book.deployed), n: `${(book.utilisation * 100).toFixed(1)}% of budget` },
              { k: "Positions", v: String(book.n_positions), n: `cap ${book.caps.max_positions}` },
              { k: "Est. credit", v: usd(book.credit_est_total), n: `${book.credit_yield_on_budget_pct}% on budget` },
              { k: "Cash idle", v: usd(book.cash_free), n: "not deployed" },
            ].map((s) => (
              <div key={s.k} className="bg-card p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
                <div className="nums mt-0.5 text-lg font-semibold">{s.v}</div>
                <div className="text-[11px] text-muted-foreground">{s.n}</div>
              </div>
            ))}
          </div>

          {book.utilisation < 0.5 ? (
            <p className="mb-3 flex items-start gap-2 rounded border border-signal-caution/40 bg-signal-caution-bg p-2.5 text-xs text-signal-caution">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Only {(book.utilisation * 100).toFixed(0)}% of the budget is deployed — there are not
                enough qualified names to fill it today. That is a candidate-supply limit, not a
                reason to loosen the caps.
              </span>
            </p>
          ) : null}

          {book.positions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <caption className="sr-only">Sized positions</caption>
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">Ticker</th>
                    <th scope="col" className="py-2 pr-3 text-left font-medium">Bucket</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Contracts</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Strike</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">DTE</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Collateral</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {book.positions.map((p) => (
                    <tr key={p.ticker} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-mono font-bold">{p.ticker}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {p.bucket}
                        {p.sector_raw && p.sector_raw !== p.bucket ? (
                          <span className="ml-1 opacity-60" title={`vendor label: ${p.sector_raw}`}>
                            ({p.sector_raw})
                          </span>
                        ) : null}
                      </td>
                      <td className="nums py-2 pr-3 text-right font-semibold">{p.contracts}</td>
                      <td className="nums py-2 pr-3 text-right">${p.strike}</td>
                      <td className="nums py-2 pr-3 text-right text-muted-foreground">{p.dte ?? "—"}</td>
                      <td className="nums py-2 pr-3 text-right">
                        {usd(p.collateral)}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {(p.collateral_pct * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="nums py-2 pr-3 text-right text-signal-long">
                        {p.credit_est == null ? "—" : usd(p.credit_est)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing fits. Every qualified name is either unaffordable at this budget or blocked by
              a cap — see below.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(book.by_bucket).map(([b, v]) => {
              const near = v.pct >= book.caps.max_bucket_pct * 0.9;
              return (
                <span
                  key={b}
                  className={`rounded border px-2 py-0.5 text-[11px] ${
                    near
                      ? "border-signal-caution/40 bg-signal-caution-bg text-signal-caution"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                  title={near ? `At or near the ${(book.caps.max_bucket_pct * 100).toFixed(0)}% bucket cap` : undefined}
                >
                  {b} {(v.pct * 100).toFixed(0)}%
                </span>
              );
            })}
          </div>

          {unaffordable.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Qualified but unaffordable:</span>{" "}
              {unaffordable.map((s) => s.ticker).join(", ")} — one contract alone breaches the{" "}
              {(book.caps.max_name_pct * 100).toFixed(0)}% per-name cap of {usd(book.caps.name_cap_usd)}.
            </p>
          ) : null}

          <p className="mt-2 text-[11px] text-muted-foreground">
            Credit is the engine&apos;s mid-price estimate. The market-data plan returns no bid/ask,
            so treat it as an upper bound. Caps are fixed fractional, not Kelly — half-Kelly on the
            settled sample is about 10% per position, and 284 overlapping trades in one regime is
            too thin to size against.
          </p>
        </>
      )}
    </section>
  );
}
