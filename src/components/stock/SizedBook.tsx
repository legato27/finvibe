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
import { useTranslations } from "next-intl";
import { Wallet, TriangleAlert } from "lucide-react";
import Panel from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Stat from "@/components/ui/Stat";
import Chip from "@/components/ui/Chip";

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

const strong = (chunks: React.ReactNode) => <strong className="font-medium text-foreground">{chunks}</strong>;
const lead = (chunks: React.ReactNode) => <span className="text-foreground">{chunks}</span>;

export default function SizedBook({
  book,
  collateral,
  onCollateralChange,
}: {
  book: Book | null;
  collateral: number | null;
  onCollateralChange: (v: number | null) => void;
}) {
  const t = useTranslations("deskPanels.sizedBook");
  const [draft, setDraft] = useState(collateral ? String(collateral) : "");

  const apply = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    onCollateralChange(Number.isFinite(n) && n > 0 ? n : null);
  };

  const unaffordable = (book?.skipped ?? []).filter((s) => s.unaffordable);

  const columns: Column<BookPosition>[] = [
    {
      key: "ticker",
      header: t("col.ticker"),
      sortable: true,
      sortValue: (p) => p.ticker,
      cell: (p) => <span className="font-mono font-bold">{p.ticker}</span>,
    },
    {
      key: "bucket",
      header: t("col.bucket"),
      ariaLabel: t("aria.bucket"),
      sortable: true,
      sortValue: (p) => p.bucket,
      hideBelow: "md",
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.bucket}
          {p.sector_raw && p.sector_raw !== p.bucket ? (
            <span className="ml-1 opacity-60" title={t("vendorLabel", { label: p.sector_raw })}>
              ({p.sector_raw})
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "contracts",
      header: t("col.contracts"),
      sortable: true,
      align: "right",
      sortValue: (p) => p.contracts,
      cell: (p) => <span className="nums font-semibold">{p.contracts}</span>,
    },
    {
      key: "strike",
      header: t("col.strike"),
      sortable: true,
      align: "right",
      sortValue: (p) => p.strike,
      cell: (p) => <span className="nums">${p.strike}</span>,
    },
    {
      key: "dte",
      header: t("col.dte"),
      ariaLabel: t("aria.dte"),
      sortable: true,
      align: "right",
      hideBelow: "lg",
      sortValue: (p) => p.dte,
      cell: (p) => <span className="nums text-muted-foreground">{p.dte ?? "—"}</span>,
    },
    {
      key: "collateral",
      header: t("col.collateral"),
      sortable: true,
      align: "right",
      sortValue: (p) => p.collateral,
      cell: (p) => (
        <span className="nums">
          {usd(p.collateral)}
          <span className="ml-1 text-[10px] text-muted-foreground">
            {(p.collateral_pct * 100).toFixed(0)}%
          </span>
        </span>
      ),
    },
    {
      key: "credit",
      header: t("col.credit"),
      sortable: true,
      align: "right",
      sortValue: (p) => p.credit_est,
      cell: (p) => (
        <span className="nums text-signal-long">{p.credit_est == null ? "—" : usd(p.credit_est)}</span>
      ),
    },
  ];

  const label = (
    <>
      <Wallet className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
      {t("label")}
    </>
  );

  const aside = (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="stat-label">{t("collateral")}</span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder={t("collateralPlaceholder")}
          aria-label={t("collateralAria")}
          className="nums w-32 rounded-control border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <button
        type="button"
        onClick={apply}
        className="rounded-control bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground"
      >
        {t("sizeIt")}
      </button>
    </div>
  );

  const reading = book ? (
    <>
      <span className="block">
        {t.rich("readingCaps", {
          strong,
          namePct: (book.caps.max_name_pct * 100).toFixed(0),
          nameCap: usd(book.caps.name_cap_usd),
          bucketPct: (book.caps.max_bucket_pct * 100).toFixed(0),
          bucketCap: usd(book.caps.bucket_cap_usd),
          maxPositions: book.caps.max_positions,
        })}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{t("readingCredit")}</span>
    </>
  ) : undefined;

  return (
    <Panel
      label={label}
      qualifier={book ? t("qualifier", { count: book.n_positions }) : t("qualifierEmpty")}
      aside={aside}
      reading={reading}
    >
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">{t("lead")}</p>

      {!book ? (
        <div className="rounded-control border border-dashed border-border p-4">
          <p className="mb-3 text-sm text-muted-foreground">{t.rich("howTo.intro", { strong })}</p>
          <ol className="mb-3 max-w-2xl list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t.rich("howTo.step1", { lead })}</li>
            <li>{t.rich("howTo.step2", { lead })}</li>
            <li>{t.rich("howTo.step3", { lead })}</li>
            <li>{t.rich("howTo.step4", { lead })}</li>
          </ol>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("howTo.outro")}</p>
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              size="sm"
              label={t("stat.deployed")}
              value={usd(book.deployed)}
              sub={t("stat.deployedSub", { pct: (book.utilisation * 100).toFixed(1) })}
            />
            <Stat
              size="sm"
              label={t("stat.positions")}
              value={String(book.n_positions)}
              sub={t("stat.positionsSub", { cap: book.caps.max_positions })}
            />
            <Stat
              size="sm"
              label={t("stat.credit")}
              value={usd(book.credit_est_total)}
              sub={t("stat.creditSub", { pct: book.credit_yield_on_budget_pct })}
            />
            <Stat
              size="sm"
              label={t("stat.idle")}
              value={usd(book.cash_free)}
              sub={t("stat.idleSub")}
            />
          </div>

          {book.utilisation < 0.5 ? (
            <p className="mb-3 flex items-start gap-2 rounded-control border border-signal-caution/40 bg-signal-caution-bg p-2.5 text-xs text-signal-caution">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("underDeployed", { pct: (book.utilisation * 100).toFixed(0) })}</span>
            </p>
          ) : null}

          <DataTable<BookPosition>
            caption={t("tableCaption")}
            columns={columns}
            rows={book.positions}
            rowKey={(p) => p.ticker}
            rowHref={(p) => `/stock/${p.ticker}`}
            emptyText={t("nothingFits")}
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(book.by_bucket).map(([b, v]) => {
              const near = v.pct >= book.caps.max_bucket_pct * 0.9;
              return (
                <span
                  key={b}
                  title={near ? t("nearCap", { pct: (book.caps.max_bucket_pct * 100).toFixed(0) }) : undefined}
                >
                  <Chip tone={near ? "caution" : "plain"}>
                    {t("bucketChip", { bucket: b, pct: (v.pct * 100).toFixed(0) })}
                  </Chip>
                </span>
              );
            })}
          </div>

          {unaffordable.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t.rich("unaffordable", {
                strong,
                tickers: unaffordable.map((s) => s.ticker).join(", "),
                pct: (book.caps.max_name_pct * 100).toFixed(0),
                cap: usd(book.caps.name_cap_usd),
              })}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
