"use client";

/**
 * The trade journal — what you actually did, at the fill you actually got.
 *
 * Everything else on the desk is either a model's opinion or a paper record
 * kept upstream. This is the only place a real fill is written down, which
 * makes it the only place one particular number can ever become visible: the
 * gap between the mid-price credit the desk quotes and what your broker
 * actually filled you at. The market-data plan returns no bid/ask, so every
 * premium figure on this page is an upper bound — and the only way to find out
 * by how much is to log real trades and compare.
 *
 * ASSIGNMENT IS NOT COUNTED AS A WIN. The option leg keeps its full credit, so
 * the arithmetic would happily call every assignment profitable, and a wheel
 * journal that does so reports a win rate approaching 100% while the account
 * fills with underwater stock. Assigned trades are therefore broken out into
 * their own column and judged on the POSITION — spot against the net basis of
 * strike minus premium — not on the premium alone.
 */
import { useMemo, useState } from "react";
import {
  useOptionsTrades,
  useAddOptionsTrade,
  useCloseOptionsTrade,
  useDeleteOptionsTrade,
  type OptionsTrade,
  type OptionStrategy,
} from "@/lib/supabase/hooks";
import { useUser } from "@/lib/supabase/hooks";
import { NotebookPen, Plus, X } from "lucide-react";

const STRATEGY_LABEL: Record<OptionStrategy, string> = {
  cash_secured_put: "Cash-secured put",
  covered_call: "Covered call",
  put_credit_spread: "Put credit spread",
  call_credit_spread: "Call credit spread",
};

const STATUS_STYLE: Record<string, string> = {
  open: "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/40",
  expired: "text-signal-long bg-signal-long-bg border-signal-long/40",
  closed: "text-signal-long bg-signal-long-bg border-signal-long/40",
  assigned: "text-signal-caution bg-signal-caution-bg border-signal-caution/40",
};

const usd = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: d })}`;

const daysTo = (iso: string) =>
  Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

export default function TradeJournal() {
  const { data: user } = useUser();
  const { data: trades, isLoading } = useOptionsTrades();
  const addTrade = useAddOptionsTrade();
  const closeTrade = useCloseOptionsTrade();
  const delTrade = useDeleteOptionsTrade();

  const [adding, setAdding] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);

  const open = (trades ?? []).filter((t) => t.status === "open");
  const done = (trades ?? []).filter((t) => t.status !== "open");

  const stats = useMemo(() => {
    const collateral = open.reduce(
      (a, t) => a + t.strike_price * t.contracts * 100, 0);
    const openCredit = open.reduce((a, t) => a + t.premium * t.contracts * 100, 0);
    const realized = done.reduce((a, t) => a + (t.realized_pnl ?? 0), 0);
    const assigned = done.filter((t) => t.status === "assigned");
    // Win rate over trades that RESOLVED without assignment. Counting an
    // assignment as a win is the distortion this whole panel guards against.
    const clean = done.filter((t) => t.status !== "assigned");
    const wins = clean.filter((t) => t.was_profitable).length;
    return {
      collateral,
      openCredit,
      realized,
      nDone: done.length,
      nAssigned: assigned.length,
      winRate: clean.length ? wins / clean.length : null,
      assignRate: done.length ? assigned.length / done.length : null,
    };
  }, [open, done]);

  if (!user) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <NotebookPen className="h-4 w-4 text-primary" />
          Trade journal
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to log trades. The journal is private to your account.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <NotebookPen className="h-4 w-4 text-primary" />
            Trade journal
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            What you actually did, at the fill you actually got. Every premium figure elsewhere on
            this page is a mid-price estimate — logging real trades is the only way to find out how
            far off they are.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {adding ? "Cancel" : "Log a trade"}
        </button>
      </header>

      {adding ? (
        <AddForm
          pending={addTrade.isPending}
          error={addTrade.error ? String(addTrade.error) : null}
          onSubmit={(v) => addTrade.mutate(v, { onSuccess: () => setAdding(false) })}
        />
      ) : null}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (trades ?? []).length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nothing logged yet. Log a trade when you open one, then mark it expired, closed or
          assigned when it resolves — the journal works out the P&amp;L, the return on collateral,
          and the annualised figure from the dates.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-4">
            {[
              { k: "Collateral tied up", v: usd(stats.collateral), n: `${open.length} open` },
              { k: "Credit at risk", v: usd(stats.openCredit), n: "on open trades" },
              {
                k: "Realised",
                v: usd(stats.realized),
                n: `${stats.nDone} resolved`,
                tone: stats.realized > 0 ? "text-signal-long" : stats.realized < 0 ? "text-signal-short" : "",
              },
              {
                k: "Won / assigned",
                v: stats.winRate == null ? "—" : `${(stats.winRate * 100).toFixed(0)}%`,
                n: `${stats.nAssigned} assigned${
                  stats.assignRate != null ? ` (${(stats.assignRate * 100).toFixed(0)}%)` : ""
                }`,
              },
            ].map((s) => (
              <div key={s.k} className="bg-card p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
                <div className={`nums mt-0.5 text-lg font-semibold ${s.tone ?? ""}`}>{s.v}</div>
                <div className="text-[11px] text-muted-foreground">{s.n}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Logged option trades</caption>
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Ticker</th>
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Strategy</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Strike</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Credit</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Expiry</th>
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Status</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">P&amp;L</th>
                  <th scope="col" className="py-2 text-right font-medium">Ann.</th>
                </tr>
              </thead>
              <tbody>
                {[...open, ...done].map((t) => {
                  const dte = daysTo(t.expiry_date);
                  const credit = t.premium * t.contracts * 100;
                  return (
                    <tr key={t.id} className="border-b border-border/60 last:border-0 align-top">
                      <td className="py-2 pr-3 font-mono font-bold">{t.ticker}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {STRATEGY_LABEL[t.strategy]}
                        <span className="ml-1">×{t.contracts}</span>
                      </td>
                      <td className="nums py-2 pr-3 text-right">${t.strike_price}</td>
                      <td className="nums py-2 pr-3 text-right">{usd(credit)}</td>
                      <td className="nums py-2 pr-3 text-right text-muted-foreground">
                        {t.expiry_date}
                        {t.status === "open" ? (
                          <span className={`ml-1 text-[10px] ${dte <= 2 ? "text-signal-short" : ""}`}>
                            {dte}d
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[t.status]}`}
                          title={
                            t.status === "assigned"
                              ? `Net basis $${(t.strike_price - t.premium).toFixed(2)} — the option kept its credit, but you hold the shares.`
                              : undefined
                          }
                        >
                          {t.status}
                        </span>
                        {t.status === "open" ? (
                          <button
                            type="button"
                            onClick={() => setClosingId(closingId === t.id ? null : t.id)}
                            className="ml-2 text-[11px] text-primary underline underline-offset-2"
                          >
                            resolve
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => delTrade.mutate(t.id)}
                            className="ml-2 text-[11px] text-muted-foreground underline underline-offset-2"
                          >
                            delete
                          </button>
                        )}
                        {closingId === t.id ? (
                          <CloseForm
                            trade={t}
                            pending={closeTrade.isPending}
                            onSubmit={(v) =>
                              closeTrade.mutate({ id: t.id, ...v }, {
                                onSuccess: () => setClosingId(null),
                              })
                            }
                          />
                        ) : null}
                      </td>
                      <td
                        className={`nums py-2 pr-3 text-right font-semibold ${
                          t.realized_pnl == null ? "text-muted-foreground"
                          : t.status === "assigned" ? "text-signal-caution"
                          : t.realized_pnl > 0 ? "text-signal-long" : "text-signal-short"
                        }`}
                      >
                        {t.realized_pnl == null ? "—" : usd(t.realized_pnl)}
                        {t.status === "assigned" ? (
                          <div className="text-[10px] font-normal text-muted-foreground">
                            holding at ${(t.strike_price - t.premium).toFixed(2)}
                          </div>
                        ) : null}
                      </td>
                      <td className="nums py-2 text-right text-muted-foreground">
                        {t.annualized_return == null
                          ? "—"
                          : `${(t.annualized_return * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            The win rate counts only trades that resolved <em>without</em> assignment. An assigned
            put keeps its whole credit, so counting it as a win would push a wheel journal toward
            100% while the account fills with underwater stock. Assignments are shown separately and
            judged on the position — spot against the net basis of strike minus premium.
          </p>
        </>
      )}
    </section>
  );
}

// ── forms ────────────────────────────────────────────────────────────────────
function Field({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
      <input
        {...p}
        className="mt-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums"
      />
    </label>
  );
}

function AddForm({
  onSubmit, pending, error,
}: {
  onSubmit: (v: {
    ticker: string; strategy: OptionStrategy; strike_price: number;
    premium: number; contracts: number; expiry_date: string;
    underlying_price_at_entry?: number | null;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [f, setF] = useState({
    ticker: "", strategy: "cash_secured_put" as OptionStrategy,
    strike_price: "", premium: "", contracts: "1", expiry_date: "", spot: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const valid =
    f.ticker.trim() && Number(f.strike_price) > 0 && Number(f.premium) > 0 &&
    Number(f.contracts) >= 1 && f.expiry_date;

  return (
    <form
      className="mb-3 rounded border border-border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          ticker: f.ticker.trim(),
          strategy: f.strategy,
          strike_price: Number(f.strike_price),
          premium: Number(f.premium),
          contracts: Number(f.contracts),
          expiry_date: f.expiry_date,
          underlying_price_at_entry: f.spot ? Number(f.spot) : null,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Ticker" value={f.ticker} onChange={set("ticker")} placeholder="ORCL" required />
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted-foreground">
          Strategy
          <select
            value={f.strategy}
            onChange={set("strategy")}
            className="mt-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {Object.entries(STRATEGY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <Field label="Strike" type="number" step="0.01" value={f.strike_price} onChange={set("strike_price")} required />
        <Field label="Premium / share" type="number" step="0.01" value={f.premium} onChange={set("premium")} placeholder="1.25" required />
        <Field label="Contracts" type="number" min="1" value={f.contracts} onChange={set("contracts")} required />
        <Field label="Expiry" type="date" value={f.expiry_date} onChange={set("expiry_date")} required />
        <Field label="Spot at entry" type="number" step="0.01" value={f.spot} onChange={set("spot")} />
      </div>
      {error ? <p className="mt-2 text-xs text-signal-short">{error}</p> : null}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={!valid || pending}
          className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save trade"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Premium per share, as filled — not the mid the desk quoted.
        </span>
      </div>
    </form>
  );
}

function CloseForm({
  trade, onSubmit, pending,
}: {
  trade: OptionsTrade;
  onSubmit: (v: {
    status: "closed" | "expired" | "assigned";
    close_price?: number | null;
    underlying_price_at_close?: number | null;
  }) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<"expired" | "closed" | "assigned">("expired");
  const [closePrice, setClosePrice] = useState("");
  const [spot, setSpot] = useState("");

  return (
    <div className="mt-2 rounded border border-border bg-background p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted-foreground">
          Outcome
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="mt-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            <option value="expired">Expired worthless</option>
            <option value="closed">Bought back</option>
            <option value="assigned">Assigned</option>
          </select>
        </label>
        {status === "closed" ? (
          <Field
            label="Paid to close / share"
            type="number"
            step="0.01"
            value={closePrice}
            onChange={(e) => setClosePrice(e.target.value)}
          />
        ) : null}
        {status === "assigned" ? (
          <Field
            label="Spot at assignment"
            type="number"
            step="0.01"
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
          />
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onSubmit({
              status,
              close_price: status === "closed" ? Number(closePrice || 0) : null,
              underlying_price_at_close: spot ? Number(spot) : null,
            })
          }
          className="rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record"}
        </button>
      </div>
      {status === "assigned" ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          You keep the ${(trade.premium * trade.contracts * 100).toFixed(0)} credit, and now hold{" "}
          {trade.contracts * 100} shares at a net basis of $
          {(trade.strike_price - trade.premium).toFixed(2)}. This will not count as a win.
        </p>
      ) : null}
    </div>
  );
}
