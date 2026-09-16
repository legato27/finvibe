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
import { useTranslations } from "next-intl";
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
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Stat from "@/components/ui/Stat";
import Chip from "@/components/ui/Chip";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";

// Rows carry their family; mode is a column, never inferred (migration 025).
const familyOf = (tr: OptionsTrade): "options" | "crypto" => tr.asset_class ?? "options";
const SETUP_OF: Record<string, string> = { scalp_A: "A", scalp_B: "B", scalp_C: "C" };

const STRATEGIES: OptionStrategy[] = [
  "cash_secured_put",
  "covered_call",
  "put_credit_spread",
  "call_credit_spread",
];

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

const INPUT_CLS =
  "rounded-control border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const PRIMARY_CLS =
  "rounded-control bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50";
const SECONDARY_CLS =
  "rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent";

export default function TradeJournal({
  defaultStrategy = "cash_secured_put",
}: {
  /** What the new-trade form opens on. The desk passes its own strategy so a
   *  covered-call desk does not hand you a cash-secured-put form. */
  defaultStrategy?: OptionStrategy;
} = {}) {
  const t = useTranslations("deskPanels.tradeJournal");
  const { data: user, isLoading: userLoading } = useUser();
  const { data: trades, isLoading, error } = useOptionsTrades();
  const addTrade = useAddOptionsTrade();
  const closeTrade = useCloseOptionsTrade();
  const delTrade = useDeleteOptionsTrade();

  const [adding, setAdding] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [family, setFamily] = useState<"options" | "crypto">("options");

  // The family chip filters the rows; paper and live never mix because a
  // crypto row is paper by construction until live crypto exists.
  const all = trades ?? [];
  const counts = { options: all.filter((tr) => familyOf(tr) === "options").length, crypto: all.filter((tr) => familyOf(tr) === "crypto").length };
  const inFamily = all.filter((tr) => familyOf(tr) === family);
  const open = inFamily.filter((tr) => tr.status === "open");
  const done = inFamily.filter((tr) => tr.status !== "open");
  const isCrypto = family === "crypto";

  const cryptoStats = useMemo(() => {
    const notional = open.reduce((a, tr) => a + Math.abs((tr.entry_px ?? 0) * (tr.size ?? 0)), 0);
    const rs = done.map((tr) => tr.r_realised).filter((x): x is number => x != null);
    const wins = done.filter((tr) => tr.was_profitable).length;
    const early = done.filter((tr) => tr.exit_reason && !["target", "stop", "time_stop"].includes(tr.exit_reason)).length;
    const gaps = done.map((tr) => (tr.slippage_realised != null && tr.slippage_modelled != null ? tr.slippage_realised - tr.slippage_modelled : null)).filter((x): x is number => x != null);
    return {
      notional, sumR: rs.reduce((a, b) => a + b, 0), nDone: done.length,
      winRate: done.length ? wins / done.length : null, early,
      slipGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    };
  }, [open, done]);

  const stats = useMemo(() => {
    const collateral = open.reduce(
      (a, tr) => a + (tr.strike_price ?? 0) * tr.contracts * 100, 0);
    const openCredit = open.reduce((a, tr) => a + tr.premium * tr.contracts * 100, 0);
    const realized = done.reduce((a, tr) => a + (tr.realized_pnl ?? 0), 0);
    const assigned = done.filter((tr) => tr.status === "assigned");
    // Win rate over trades that RESOLVED without assignment. Counting an
    // assignment as a win is the distortion this whole panel guards against.
    const clean = done.filter((tr) => tr.status !== "assigned");
    const wins = clean.filter((tr) => tr.was_profitable).length;
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

  const label = (
    <>
      <NotebookPen className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
      {t("label")}
    </>
  );

  if (userLoading) {
    return <PanelPending label={label} text={t("checkingSession")} />;
  }
  if (!user) {
    return <PanelUnavailable label={label} reason={t("signedOut")} />;
  }
  if (error) {
    return <PanelUnavailable label={label} reason={t("unavailable")} />;
  }
  if (isLoading) {
    return <PanelPending label={label} text={t("loading")} />;
  }

  const columns: Column<OptionsTrade>[] = [
    {
      key: "ticker",
      header: t("col.ticker"),
      sortable: true,
      sortValue: (tr) => tr.ticker,
      cell: (tr) => <span className="font-mono font-bold">{tr.ticker}</span>,
    },
    {
      key: "strategy",
      header: t("col.strategy"),
      sortable: true,
      sortValue: (tr) => tr.strategy,
      cell: (tr) => (
        <span className="text-xs text-muted-foreground">
          {t(`strategy.${tr.strategy}`)}
          <span className="ml-1">{t("contractsSuffix", { count: tr.contracts })}</span>
        </span>
      ),
    },
    {
      key: "strike",
      header: t("col.strike"),
      sortable: true,
      align: "right",
      sortValue: (tr) => tr.strike_price,
      cell: (tr) => <span className="nums">${tr.strike_price}</span>,
    },
    {
      key: "credit",
      header: t("col.credit"),
      sortable: true,
      align: "right",
      hideBelow: "md",
      sortValue: (tr) => tr.premium * tr.contracts * 100,
      cell: (tr) => <span className="nums">{usd(tr.premium * tr.contracts * 100)}</span>,
    },
    {
      key: "expiry",
      header: t("col.expiry"),
      sortable: true,
      align: "right",
      sortValue: (tr) => tr.expiry_date,
      cell: (tr) => {
        const dte = daysTo(tr.expiry_date);
        return (
          <span className="nums text-muted-foreground">
            {tr.expiry_date}
            {tr.status === "open" ? (
              <span className={`ml-1 text-[10px] ${dte <= 2 ? "text-signal-short" : ""}`}>
                {t("dteSuffix", { days: dte })}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t("col.status"),
      sortable: true,
      sortValue: (tr) => tr.status,
      cell: (tr) => (
        <div className="min-w-0">
          <span
            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[tr.status]}`}
            title={
              tr.status === "assigned"
                ? t("assignedTitle", { basis: (tr.strike_price - tr.premium).toFixed(2) })
                : undefined
            }
          >
            {t(`status.${tr.status}`)}
          </span>
          {tr.status === "open" ? (
            <button
              type="button"
              onClick={() => setClosingId(closingId === tr.id ? null : tr.id)}
              className="ml-2 text-[11px] text-signal underline underline-offset-2"
            >
              {t("resolve")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => delTrade.mutate(tr.id)}
              className="ml-2 text-[11px] text-muted-foreground underline underline-offset-2"
            >
              {t("delete")}
            </button>
          )}
          {closingId === tr.id ? (
            <CloseForm
              trade={tr}
              pending={closeTrade.isPending}
              onSubmit={(v) =>
                closeTrade.mutate({ id: tr.id, ...v }, {
                  onSuccess: () => setClosingId(null),
                })
              }
            />
          ) : null}
        </div>
      ),
    },
    {
      key: "pnl",
      header: t("col.pnl"),
      ariaLabel: t("aria.pnl"),
      sortable: true,
      align: "right",
      sortValue: (tr) => tr.realized_pnl,
      cell: (tr) => (
        <span
          className={`nums font-semibold ${
            tr.realized_pnl == null ? "text-muted-foreground"
            : tr.status === "assigned" ? "text-signal-caution"
            : tr.realized_pnl > 0 ? "text-signal-long" : "text-signal-short"
          }`}
        >
          {tr.realized_pnl == null ? "—" : usd(tr.realized_pnl)}
          {tr.status === "assigned" ? (
            <span className="block text-[10px] font-normal text-muted-foreground">
              {t("holdingAt", { basis: (tr.strike_price - tr.premium).toFixed(2) })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "ann",
      header: t("col.ann"),
      ariaLabel: t("aria.ann"),
      sortable: true,
      align: "right",
      hideBelow: "lg",
      sortValue: (tr) => tr.annualized_return,
      cell: (tr) => (
        <span className="nums text-muted-foreground">
          {tr.annualized_return == null ? "—" : `${(tr.annualized_return * 100).toFixed(0)}%`}
        </span>
      ),
    },
  ];

  const cryptoColumns: Column<OptionsTrade>[] = [
    { key: "ticker", header: t("col.ticker"), sortable: true, sortValue: (tr) => tr.ticker, cell: (tr) => <span className="font-mono font-bold">{tr.ticker.replace("USDT", "")}</span> },
    { key: "setup", header: t("col.setup"), sortable: true, sortValue: (tr) => tr.strategy, cell: (tr) => <span className="text-xs text-muted-foreground">{SETUP_OF[tr.strategy] ?? tr.strategy} · {tr.side ?? "—"} <Chip tone="plain">{t("paper")}</Chip></span> },
    { key: "session", header: t("col.session"), hideBelow: "md", cell: (tr) => <span className="text-xs">{tr.session ?? "—"}</span> },
    { key: "entry", header: t("col.strike"), align: "right", sortValue: (tr) => tr.entry_px ?? 0, cell: (tr) => <span className="nums">{tr.entry_px == null ? "—" : tr.entry_px.toLocaleString(undefined, { maximumFractionDigits: 4 })}{tr.exit_px != null ? <span className="text-muted-foreground"> → {tr.exit_px.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> : null}</span> },
    { key: "status", header: t("col.status"), cell: (tr) => <span className={`rounded-control border px-1.5 py-px text-[10px] font-semibold uppercase ${STATUS_STYLE[tr.status] ?? ""}`}>{tr.status === "open" ? t("status.open") : (tr.exit_reason ?? tr.status)}</span> },
    { key: "r", header: t("col.r"), sortable: true, align: "right", sortValue: (tr) => tr.r_realised ?? 0, cell: (tr) => <span className={`nums font-semibold ${tr.r_realised == null ? "text-muted-foreground" : tr.r_realised > 0 ? "text-signal-long" : "text-signal-short"}`}>{tr.r_realised == null ? (tr.r_planned != null ? `plan ${tr.r_planned.toFixed(1)}R` : "—") : `${tr.r_realised >= 0 ? "+" : ""}${tr.r_realised.toFixed(2)}R`}</span> },
    { key: "pnl", header: t("col.pnl"), sortable: true, align: "right", hideBelow: "md", sortValue: (tr) => tr.realized_pnl ?? 0, cell: (tr) => <span className="nums">{tr.realized_pnl == null ? "—" : usd(tr.realized_pnl)}</span> },
    { key: "mae", header: t("col.mae"), align: "right", hideBelow: "lg", cell: (tr) => <span className="nums text-xs text-muted-foreground">{tr.mae == null && tr.mfe == null ? "—" : `${tr.mae?.toFixed(2) ?? "—"} / ${tr.mfe?.toFixed(2) ?? "—"}`}</span> },
    { key: "slip", header: t("col.slip"), align: "right", hideBelow: "lg", optional: true, cell: (tr) => <span className="nums text-xs text-muted-foreground">{tr.slippage_realised != null && tr.slippage_modelled != null ? `${(tr.slippage_realised - tr.slippage_modelled) >= 0 ? "+" : ""}${(tr.slippage_realised - tr.slippage_modelled).toFixed(2)}` : "—"}</span> },
  ];

  const hasTrades = inFamily.length > 0;

  return (
    <Panel
      label={label}
      qualifier={hasTrades ? t("qualifier", { count: open.length }) : undefined}
      aside={
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className={`flex items-center gap-1.5 ${adding ? SECONDARY_CLS : PRIMARY_CLS}`}
        >
          {adding ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          {adding ? t("cancel") : t("logTrade")}
        </button>
      }
      reading={hasTrades ? t.rich("reading", { em: (chunks) => <em>{chunks}</em> }) : undefined}
    >
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">{t("lead")}</p>

      {CRYPTO_MODULE_ENABLED ? (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("familyLabel")}>
          {(["options", "crypto"] as const).map((f) => (
            <Chip key={f} active={family === f} onClick={() => setFamily(f)}>{t(`family.${f}`)} {counts[f]}</Chip>
          ))}
        </div>
      ) : null}

      {adding && !isCrypto ? (
        <AddForm
          defaultStrategy={defaultStrategy}
          pending={addTrade.isPending}
          error={addTrade.error ? String(addTrade.error) : null}
          onSubmit={(v) => addTrade.mutate(v, { onSuccess: () => setAdding(false) })}
        />
      ) : null}

      {!hasTrades ? (
        <p className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground">
          {isCrypto ? t("cryptoEmpty") : t("empty")}
        </p>
      ) : isCrypto ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat size="sm" label={t("stat.cryptoOpen")} value={String(open.length)} sub={t("stat.cryptoOpenSub", { notional: usd(cryptoStats.notional) })} />
            <Stat size="sm" label={t("stat.cryptoR")} value={`${cryptoStats.sumR >= 0 ? "+" : ""}${cryptoStats.sumR.toFixed(2)}R`} sub={t("stat.cryptoRSub", { count: cryptoStats.nDone })} tone={cryptoStats.sumR > 0 ? "long" : cryptoStats.sumR < 0 ? "short" : "plain"} />
            <Stat size="sm" label={t("stat.cryptoWon")} value={cryptoStats.winRate == null ? "—" : `${(cryptoStats.winRate * 100).toFixed(0)}%`} sub={t("stat.cryptoWonSub", { early: cryptoStats.early })} />
            <Stat size="sm" label={t("stat.cryptoSlip")} value={cryptoStats.slipGap == null ? "—" : `${cryptoStats.slipGap >= 0 ? "+" : ""}${cryptoStats.slipGap.toFixed(2)}`} sub={t("stat.cryptoSlipSub")} />
          </div>
          <DataTable<OptionsTrade>
            caption={t("tableCaption")}
            columns={cryptoColumns}
            rows={[...open, ...done]}
            rowKey={(tr) => String(tr.id)}
          />
        </>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              size="sm"
              label={t("stat.collateral")}
              value={usd(stats.collateral)}
              sub={t("stat.collateralSub", { count: open.length })}
            />
            <Stat
              size="sm"
              label={t("stat.credit")}
              value={usd(stats.openCredit)}
              sub={t("stat.creditSub")}
            />
            <Stat
              size="sm"
              label={t("stat.realised")}
              value={usd(stats.realized)}
              sub={t("stat.realisedSub", { count: stats.nDone })}
              tone={stats.realized > 0 ? "long" : stats.realized < 0 ? "short" : "plain"}
            />
            <Stat
              size="sm"
              label={t("stat.won")}
              value={stats.winRate == null ? "—" : `${(stats.winRate * 100).toFixed(0)}%`}
              sub={
                stats.assignRate != null
                  ? t("stat.wonSubRate", { count: stats.nAssigned, pct: (stats.assignRate * 100).toFixed(0) })
                  : t("stat.wonSub", { count: stats.nAssigned })
              }
            />
          </div>

          <DataTable<OptionsTrade>
            caption={t("tableCaption")}
            columns={columns}
            rows={[...open, ...done]}
            rowKey={(tr) => String(tr.id)}
            rowHref={(tr) => `/stock/${tr.ticker}`}
          />
        </>
      )}
    </Panel>
  );
}

// ── forms ────────────────────────────────────────────────────────────────────
function Field({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="stat-label">{label}</span>
      <input {...p} className={`nums font-mono ${INPUT_CLS}`} />
    </label>
  );
}

function AddForm({
  onSubmit, pending, error, defaultStrategy,
}: {
  defaultStrategy: OptionStrategy;
  onSubmit: (v: {
    ticker: string; strategy: OptionStrategy; strike_price: number;
    premium: number; contracts: number; expiry_date: string;
    underlying_price_at_entry?: number | null;
  }) => void;
  pending: boolean;
  error: string | null;
}) {
  const t = useTranslations("deskPanels.tradeJournal");
  const [f, setF] = useState({
    ticker: "", strategy: defaultStrategy,
    strike_price: "", premium: "", contracts: "1", expiry_date: "", spot: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const valid =
    f.ticker.trim() && Number(f.strike_price) > 0 && Number(f.premium) > 0 &&
    Number(f.contracts) >= 1 && f.expiry_date;

  return (
    <form
      className="mb-3 rounded-control border border-border bg-background p-3"
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
        <Field label={t("form.ticker")} value={f.ticker} onChange={set("ticker")} placeholder={t("form.tickerPlaceholder")} required />
        <label className="flex flex-col gap-1">
          <span className="stat-label">{t("form.strategy")}</span>
          <select value={f.strategy} onChange={set("strategy")} className={INPUT_CLS}>
            {STRATEGIES.map((k) => (
              <option key={k} value={k}>{t(`strategy.${k}`)}</option>
            ))}
          </select>
        </label>
        <Field label={t("form.strike")} type="number" step="0.01" value={f.strike_price} onChange={set("strike_price")} required />
        <Field label={t("form.premium")} type="number" step="0.01" value={f.premium} onChange={set("premium")} placeholder={t("form.premiumPlaceholder")} required />
        <Field label={t("form.contracts")} type="number" min="1" value={f.contracts} onChange={set("contracts")} required />
        <Field label={t("form.expiry")} type="date" value={f.expiry_date} onChange={set("expiry_date")} required />
        <Field label={t("form.spotAtEntry")} type="number" step="0.01" value={f.spot} onChange={set("spot")} />
      </div>
      {error ? <p className="mt-2 text-xs text-signal-short">{error}</p> : null}
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={!valid || pending} className={PRIMARY_CLS}>
          {pending ? t("form.saving") : t("form.save")}
        </button>
        <span className="text-[11px] text-muted-foreground">{t("form.fillNote")}</span>
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
  const t = useTranslations("deskPanels.tradeJournal");
  const [status, setStatus] = useState<"expired" | "closed" | "assigned">("expired");
  const [closePrice, setClosePrice] = useState("");
  const [spot, setSpot] = useState("");

  return (
    <div className="mt-2 rounded-control border border-border bg-background p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="stat-label">{t("form.outcome")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={INPUT_CLS}
          >
            <option value="expired">{t("form.expired")}</option>
            <option value="closed">{t("form.boughtBack")}</option>
            <option value="assigned">{t("form.assigned")}</option>
          </select>
        </label>
        {status === "closed" ? (
          <Field
            label={t("form.paidToClose")}
            type="number"
            step="0.01"
            value={closePrice}
            onChange={(e) => setClosePrice(e.target.value)}
          />
        ) : null}
        {status === "assigned" ? (
          <Field
            label={t("form.spotAtAssignment")}
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
          className={PRIMARY_CLS}
        >
          {pending ? t("form.saving") : t("form.record")}
        </button>
      </div>
      {status === "assigned" ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("form.assignedNote", {
            credit: (trade.premium * trade.contracts * 100).toFixed(0),
            shares: trade.contracts * 100,
            basis: (trade.strike_price - trade.premium).toFixed(2),
          })}
        </p>
      ) : null}
    </div>
  );
}
