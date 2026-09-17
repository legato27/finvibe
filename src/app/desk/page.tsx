"use client";

/**
 * Option desk — short-put and covered-call candidates, GRADED rather than
 * filtered.
 *
 * The distinction is the whole point of this page existing next to /options.
 * The screener lists the watchlist; the desk answers "what would I write
 * today, and why that one". It could have been built as the conjunctive filter
 * the desk spec originally described — F-Score >= 6 AND Altman Z >= 2.6 AND
 * price <= 0.85 x DCF AND IV Rank >= 35 AND OU z < -2.0 — but measured against
 * the live 414-name universe the DCF term alone cuts it to 50 names before the
 * other four apply, and the intersection is empty on most mornings. A premium
 * grind needs a steady flow of candidates; a screen that fires twice a quarter
 * is a lottery.
 *
 * So the backend applies two hard gates (solvency, liquidity) and scores the
 * rest, and this page renders all three tiers. A rejected name stays visible
 * with its reason attached. The trader can always see why the top tier is thin
 * — which is the thing an empty table can never tell them.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { optionsApi } from "@/lib/api";
import DataTable, { Column } from "@/components/ui/DataTable";
import type { FilterDef } from "@/components/shared/ColumnFilters";
import { WatchlistStar } from "@/components/shared/WatchlistStar";
import Freshness from "@/components/ui/Freshness";
import Segmented from "@/components/ui/Segmented";
import Chip from "@/components/ui/Chip";
import { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import GuideCard from "@/components/ui/GuideCard";
import VerdictBadge, { VerdictState } from "@/components/ui/VerdictBadge";
import { ShieldAlert, ShieldCheck, TrendingDown, Landmark } from "lucide-react";
import SizedBook, { type Book } from "@/components/stock/SizedBook";
import AssignmentBacktest from "@/components/stock/AssignmentBacktest";
import CoveredCallBook from "@/components/stock/CoveredCallBook";
import RecoTrackRecord from "@/components/stock/RecoTrackRecord";
import { TrackRecordPanel } from "@/components/stock/TrackRecordPanel";
import { CRYPTO_MODULE_ENABLED } from "@/modules/crypto/flag";
import TradeJournal from "@/components/stock/TradeJournal";

type Tier = "qualified" | "watch" | "rejected";
type Strategy = "csp" | "covered_call";

interface Gate {
  gate: string;
  passed: boolean;
  value?: number | null;
  classification?: string | null;
  reason?: string | null;
}

interface Resistance {
  spot: number | null;
  gamma_wall: number | null;
  gamma_wall_call_oi: number | null;
  gamma_wall_vs_spot_pct: number | null;
  max_pain: number | null;
  hvn: number | null;
  hvn_vs_spot_pct: number | null;
  hvn_note?: string | null;
  poc: number | null;
  /** Lowest of the available reads — the first level a rally actually meets. */
  resistance: number | null;
  resistance_source: string | null;
  resistance_vs_spot_pct?: number | null;
  note: string | null;
}

interface DeskRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  sector_raw?: string | null;
  correlation_bucket?: string;
  last_price: number | null;
  spot: number | null;
  verdict: string | null;
  next_earnings_date: string | null;

  f_score: number | null;
  altman_z: number | null;
  altman_z_prime: number | null;
  altman_class: string | null;
  altman_class_prime: string | null;
  ou_z_score: number | null;
  ou_half_life_days: number | null;
  ou_equilibrium: number | null;
  margin_of_safety: number | null;

  atm_iv_pct: number | null;
  iv_percentile: number | null;
  iv_rank: number | null;
  iv_n_days: number | null;
  expected_move_30d_pct: number | null;
  summary_date: string | null;
  summary_at: string | null;

  strike: number | null;
  strike_oi: number | null;
  dte: number | null;
  expiry_date: string | null;
  delta: number | null;
  premium_est: number | null;
  breakeven: number | null;
  annualized_return_pct: number | null;
  pop_pred: number | null;
  engine_strategy: string | null;
  reco_made_at: string | null;
  /** "quote_band" = targeted today from recorded per-strike quotes; "reco_log" = inherited. */
  strike_source: "quote_band" | "reco_log" | null;

  resistance?: Resistance;

  is_etf?: boolean;
  /** Components that do not apply to this instrument at all (a fund has no F-Score). */
  score_na?: string[];

  gates: Gate[];
  gates_failed: string[];
  tier: Tier;
  score: number;
  score_breakdown: Record<string, number | null>;
  score_coverage: number;
}

interface DeskResponse {
  strategy: Strategy;
  universe_size: number;
  book: Book | null;
  count: number;
  tiers: Record<Tier, number>;
  gates: { solvency: string; liquidity: string };
  weights: Record<string, number>;
  rows: DeskRow[];
}

const fmt = (v: number | null | undefined, d = 1, suffix = "") =>
  v == null ? "—" : `${v.toFixed(d)}${suffix}`;

const TIER_STYLE: Record<Tier, { label: string; cls: string }> = {
  qualified: { label: "tierQualified", cls: "text-signal-long bg-signal-long-bg border-signal-long/40" },
  watch: { label: "tierWatch", cls: "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/40" },
  rejected: { label: "tierRejected", cls: "text-signal-short bg-signal-short-bg border-signal-short/40" },
};

/** Days until an earnings print, or null when we have no date. */
function daysToEarnings(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

export default function OptionDeskPage() {
  const t = useTranslations("desk");
  const [strategy, setStrategy] = useState<Strategy>("csp");
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [collateral, setCollateral] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<DeskResponse>({
    queryKey: ["option-desk", strategy, collateral],
    queryFn: () => optionsApi.desk(strategy, 400, { collateral: collateral ?? undefined }),
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  const allRows = data?.rows ?? [];
  const rows = tierFilter === "all" ? allRows : allRows.filter((r) => r.tier === tierFilter);
  const isCsp = strategy === "csp";
  const router = useRouter();
  // The crypto desk hands a strategy back in the query when the reader
  // switches away from it; read it once, without a Suspense boundary.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("strategy");
    if (s === "covered_call" || s === "csp") setStrategy(s);
  }, []);

  // Freshness from when the summary was written, not its UTC date: the
  // snapshot lands at ~21:38 UTC (05:38 SGT), and dating it by snap_date
  // read "updated yesterday" every evening for data a few hours old.
  const deskAsOf = allRows.reduce<string | null>(
    (max, r) => {
      const at = r.summary_at ?? r.summary_date;
      return at && (!max || at > max) ? at : max;
    },
    null,
  );

  const filters: FilterDef<DeskRow>[] = [
    { key: "ticker", label: t("filter.ticker"), kind: "text", value: (r) => r.ticker },
    { key: "sector", label: t("filter.sector"), kind: "select", value: (r) => r.sector ?? "" },
    { key: "bucket", label: t("filter.bucket"), kind: "select", value: (r) => r.correlation_bucket ?? "" },
    { key: "tier", label: t("filter.tier"), kind: "select", value: (r) => r.tier },
    { key: "score", label: t("filter.score"), kind: "number", value: (r) => Math.round(r.score * 100) },
    { key: "ivp", label: t("filter.ivp"), kind: "number", value: (r) => r.iv_percentile },
    { key: "fscore", label: t("filter.fscore"), kind: "number", value: (r) => r.f_score },
    { key: "ouz", label: t("filter.ouz"), kind: "number", value: (r) => r.ou_z_score },
    { key: "ann", label: t("filter.ann"), kind: "number", value: (r) => r.annualized_return_pct },
    { key: "dte", label: t("filter.dte"), kind: "number", value: (r) => r.dte },
  ];

  const columns: Column<DeskRow>[] = [
    {
      key: "ticker",
      header: t("col.ticker"),
      sortable: true,
      sortValue: (r) => r.ticker,
      // max-w-0 on the cell lets the name truncate inside an auto-layout table.
      className: "w-[210px] max-w-0",
      cell: (r) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="font-mono font-bold">{r.ticker}</span>
          {r.is_etf ? (
            <span
              className="rounded border border-border px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              title={t("fundTitle")}
            >
              ETF
            </span>
          ) : null}
          <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:inline" title={r.name ?? undefined}>{r.name}</span>
        </span>
      ),
    },
    {
      // Outside the first cell — that one carries the row-stretched link and a
      // button cannot nest inside it.
      key: "watch",
      header: <span aria-hidden="true">★</span>,
      ariaLabel: t("aria.watchlist"),
      cell: (r) => <WatchlistStar ticker={r.ticker} />,
    },
    {
      key: "tier",
      header: t("col.tier"),
      sortable: true,
      sortValue: (r) => ({ qualified: 0, watch: 1, rejected: 2 })[r.tier],
      cell: (r) => {
        const s = TIER_STYLE[r.tier];
        const why = r.gates.find((g) => !g.passed)?.reason;
        return (
          <span
            className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
            title={why ?? undefined}
          >
            {t(s.label)}
          </span>
        );
      },
    },
    {
      key: "score",
      header: t("col.score"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.score,
      cell: (r) => {
        // A score computed from a third of the weight is not the same claim as
        // one computed from all of it — AIPO read 100 off a single component.
        // The number stays, but it stops looking authoritative.
        const thin = r.score_coverage < 0.6;
        const na = r.score_na ?? [];
        return (
          <span
            className={`nums font-semibold ${thin ? "text-muted-foreground" : ""}`}
            title={
              Object.entries(r.score_breakdown)
                .map(([k, v]) =>
                  na.includes(k)
                    ? `${k}: n/a for a fund`
                    : `${k}: ${v == null ? t("notMeasured") : v.toFixed(2)}`)
                .join("\n") +
              `\n\n${Math.round(r.score_coverage * 100)}% of the applicable weight is informed` +
              (thin ? t("tooThin") : "")
            }
          >
            {Math.round(r.score * 100)}
            {thin ? (
              <span className="ml-1 text-[10px] font-normal">
                ({Math.round(r.score_coverage * 100)}%)
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "verdict",
      header: t("col.verdict"),
      sortable: true,
      sortValue: (r) => r.verdict ?? "",
      hideBelow: "lg",
      cell: (r) => <VerdictBadge state={(r.verdict ?? null) as VerdictState} />,
    },
    // ── the two hard gates, made visible ──────────────────────────────────
    {
      key: "solvency",
      header: t("col.altman"),
      ariaLabel: t("aria.altman"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.altman_z ?? r.altman_z_prime,
      cell: (r) => {
        const cls = r.altman_class ?? r.altman_class_prime;
        const tone =
          cls === "Safe" ? "text-signal-long"
          : cls === "Distress" ? "text-signal-short"
          : "text-signal-neutral";
        return (
          <span className={`nums ${tone}`} title={`Z ${fmt(r.altman_z, 2)} · Z' ${fmt(r.altman_z_prime, 2)}`}>
            {fmt(r.altman_z ?? r.altman_z_prime, 2)}
            {cls ? <span className="ml-1 text-[10px] uppercase opacity-70">{cls}</span> : null}
          </span>
        );
      },
    },
    {
      key: "oi",
      header: t("col.strikeOi"),
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => r.strike_oi,
      cell: (r) => <span className="nums">{r.strike_oi?.toLocaleString() ?? "—"}</span>,
    },
    // ── the scored inputs ─────────────────────────────────────────────────
    {
      key: "ivp",
      header: t("col.ivPct"),
      ariaLabel: t("aria.ivPct"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.iv_percentile,
      cell: (r) => (
        <span
          className="nums"
          title={
            r.iv_n_days
              ? `${r.iv_n_days} observations. Percentile, not rank — rank is a min/max statistic and one bad print flattens it for a year.`
              : undefined
          }
        >
          {fmt(r.iv_percentile, 0)}
        </span>
      ),
    },
    {
      key: "iv",
      header: t("col.atmIv"),
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => r.atm_iv_pct,
      cell: (r) => <span className="nums">{fmt(r.atm_iv_pct, 1, "%")}</span>,
    },
    {
      key: "fscore",
      header: t("col.f"),
      ariaLabel: t("aria.f"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.f_score,
      cell: (r) => (
        <span className="nums" title={t("fScoreTitle")}>
          {r.f_score == null ? "—" : `${r.f_score}/9`}
        </span>
      ),
    },
    {
      key: "ouz",
      header: t("col.ouZ"),
      ariaLabel: t("aria.ouZ"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.ou_z_score,
      cell: (r) => (
        <span
          className={`nums ${(r.ou_z_score ?? 0) < -1 ? "text-signal-long" : "text-muted-foreground"}`}
          title={
            r.ou_equilibrium != null
              ? `Equilibrium ${r.ou_equilibrium.toFixed(2)} · half-life ${fmt(r.ou_half_life_days, 1)}d`
              : undefined
          }
        >
          {fmt(r.ou_z_score, 2)}
        </span>
      ),
    },
    // ── the trade ─────────────────────────────────────────────────────────
    {
      key: "strike",
      header: isCsp ? t("col.putStrike") : t("col.callStrike"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.strike,
      cell: (r) => {
        if (r.strike == null) {
          // Covered calls do not need a nominated contract: the strike follows
          // from resistance and the holder's own cost basis, which the desk
          // cannot see. The Gamma wall column carries the level.
          return (
            <span
              className="text-muted-foreground"
              title={isCsp ? undefined : t("ccStrikeTitle")}
            >
              —
            </span>
          );
        }
        const fresh = r.strike_source === "quote_band";
        return (
          <span
            className="nums"
            title={
              fresh
                ? t("strikeFresh")
                : t("strikeInherited")
            }
          >
            ${r.strike}
            {!fresh ? <span className="ml-1 text-[10px] text-muted-foreground">{t("logged")}</span> : null}
          </span>
        );
      },
    },
    ...(isCsp
      ? []
      : ([
          {
            key: "wall",
            header: t("col.resistance"),
            ariaLabel: t("aria.resistance"),
            sortable: true,
            align: "right",
            sortValue: (r: DeskRow) => r.resistance?.resistance ?? null,
            cell: (r: DeskRow) => {
              const res = r.resistance;
              if (!res?.resistance) {
                return (
                  <span
                    className="text-muted-foreground"
                    title={res?.hvn_note ?? res?.note ?? "no level above spot in the stored data"}
                  >
                    —
                  </span>
                );
              }
              const src =
                res.resistance_source === "hvn" ? "volume shelf"
                : res.resistance_source === "gamma_wall" ? "call OI wall"
                : "max pain";
              return (
                <span
                  className="nums"
                  title={
                    `Lowest of: volume shelf ${res.hvn ?? "—"} · call OI wall ${res.gamma_wall ?? "—"}` +
                    ` · max pain ${res.max_pain ?? "—"} (90-day POC ${res.poc ?? "—"}).` +
                    ` Sell ABOVE your cost basis, not just above this.`
                  }
                >
                  ${res.resistance}
                  <span className="ml-1 text-[10px] text-muted-foreground">{src}</span>
                </span>
              );
            },
          },
          {
            key: "maxpain",
            header: t("col.maxPain"),
            sortable: true,
            align: "right",
            optional: true,
            sortValue: (r: DeskRow) => r.resistance?.max_pain ?? null,
            cell: (r: DeskRow) =>
              r.resistance?.max_pain == null ? "—" : <span className="nums">${r.resistance.max_pain}</span>,
          },
        ] as Column<DeskRow>[])),
    {
      key: "dte",
      header: t("col.dte"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.dte,
      cell: (r) => <span className="nums">{r.dte ?? "—"}</span>,
    },
    {
      key: "delta",
      header: t("col.delta"),
      ariaLabel: t("aria.delta"),
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => (r.delta == null ? null : Math.abs(r.delta)),
      cell: (r) => <span className="nums">{fmt(r.delta == null ? null : Math.abs(r.delta), 2)}</span>,
    },
    {
      key: "prem",
      header: t("col.premium"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.premium_est,
      cell: (r) => <span className="nums">{r.premium_est == null ? "—" : `$${r.premium_est.toFixed(2)}`}</span>,
    },
    {
      key: "ann",
      header: t("col.annPct"),
      ariaLabel: isCsp ? t("annAriaCsp") : t("annAriaCc"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.annualized_return_pct,
      cell: (r) => (
        <span
          className="nums"
          title={
            (isCsp
              ? "Return on the cash you set aside as collateral. "
              : "Premium yield against the value of the shares you already hold — there is no cash collateral in a covered call. ") +
            "Priced off the recorded quote — the mid where a two-sided market was captured, the last close otherwise — so treat it as an upper bound rather than an expectation." +
            (r.strike_source === "reco_log"
              ? " This row's premium is inherited from an older recommendation and is annualized over the days that are LEFT, not the days it was written over."
              : "")
          }
        >
          {fmt(r.annualized_return_pct, 1, "%")}
        </span>
      ),
    },
    {
      key: "be",
      header: t("col.breakeven"),
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => r.breakeven,
      cell: (r) => (
        <span
          className="nums"
          title={
            isCsp
              ? "Strike minus premium — what you would effectively pay per share if assigned."
              : "Spot minus premium — how far the shares can fall before the credit stops covering it. Measured from today because the desk cannot see your cost basis; the Covered calls panel joins your real basis in your browser."
          }
        >
          {r.breakeven == null ? "—" : `$${r.breakeven.toFixed(2)}`}
        </span>
      ),
    },
    {
      key: "earn",
      header: t("col.earnings"),
      sortable: true,
      align: "right",
      sortValue: (r) => daysToEarnings(r.next_earnings_date),
      cell: (r) => {
        const d = daysToEarnings(r.next_earnings_date);
        if (d == null) return <span className="text-muted-foreground">—</span>;
        // An earnings print inside the contract's life is the single most
        // reliable way to turn a premium grind into a gap loss.
        const inside = r.dte != null && d >= 0 && d <= r.dte;
        return (
          <span
            className={`nums ${inside ? "text-signal-short font-semibold" : "text-muted-foreground"}`}
            title={inside ? `Earnings ${r.next_earnings_date} falls INSIDE this contract` : r.next_earnings_date ?? undefined}
          >
            {d}d
          </span>
        );
      },
    },
  ];

  const tiers = data?.tiers;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Freshness at={deskAsOf} />
          <Segmented
            ariaLabel={t("strategyLabel")}
            value={strategy}
            onChange={(v) => { if ((v as string) === "crypto") { router.push("/desk/crypto"); return; } if ((v as string) === "scalp") { router.push("/desk/scalp"); return; } setStrategy(v as Strategy); }}
            options={[
              { value: "csp", label: <span className="flex flex-col items-start leading-tight"><span>{t("sellPuts")}</span><span className="text-[10px] font-normal opacity-70">{t("sellPutsCaption")}</span></span> },
              { value: "covered_call", label: <span className="flex flex-col items-start leading-tight"><span>{t("coveredCalls")}</span><span className="text-[10px] font-normal opacity-70">{t("coveredCallsCaption")}</span></span> },
              // Crypto module (src/modules/crypto): a third choice that is its own route.
              ...(CRYPTO_MODULE_ENABLED ? [{ value: "crypto" as const, label: <span className="flex flex-col items-start leading-tight"><span>{t("crypto")}</span><span className="text-[10px] font-normal opacity-70">{t("cryptoCaption")}</span></span> }] : []),
    ...(CRYPTO_MODULE_ENABLED ? [{ value: "scalp" as const, label: <span className="flex flex-col items-start leading-tight"><span>{t("scalp")}</span><span className="text-[10px] font-normal opacity-70">{t("scalpCaption")}</span></span> }] : []),
            ]}
          />
        </div>
      </header>

      {/* Decision first, then evidence, then the manual — the ranked table
          below is for exploring, but most visits end at the book. */}
      {isCsp ? (
        <SizedBook
          book={data?.book ?? null}
          collateral={collateral}
          onCollateralChange={setCollateral}
        />
      ) : (
        <CoveredCallBook />
      )}

      <TradeJournal family="options" defaultStrategy={isCsp ? "cash_secured_put" : "covered_call"} />

      <AssignmentBacktest strategy={strategy} />

      <RecoTrackRecord strategy={strategy} />

      <TrackRecordPanel strategy={strategy} />

      <GuideCard
        title={t("guide.title")}
        intro={t("guide.intro")}
        sections={[
          { title: t("guide.gatesTitle"), tone: "plain", steps: [isCsp ? t("guide.gatesCsp1") : t("guide.gatesCc1"), t("guide.gates2"), t("guide.gates3")] },
          { title: t("guide.scoreTitle"), tone: "long", steps: [t("guide.score1"), isCsp ? t("guide.scoreCsp2") : t("guide.scoreCc2"), isCsp ? t("guide.scoreCsp3") : t("guide.scoreCc3"), t("guide.score4"), t("guide.score5"), t("guide.score6")] },
          { title: t("guide.fundsTitle"), tone: "plain", steps: [t("guide.funds1"), t("guide.funds2"), t("guide.funds3"), t("guide.funds4")] },
          { title: t("guide.beforeTitle"), tone: "short", steps: [t("guide.before1"), t("guide.before2"), t("guide.before3"), t("guide.before4"), t("guide.before5"), t("guide.before6")] },
        ]}
        footnote={t("guide.footnote")}
      />

      {/* Tier counts double as the tier filter. */}
      {tiers ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label={t("tierFilterLabel")}>
          <Chip active={tierFilter === "all"} onClick={() => setTierFilter("all")}>{t("tierAll")} {data?.universe_size ?? 0}</Chip>
          {(["qualified", "watch", "rejected"] as Tier[]).map((tier) => (
            <Chip key={tier} active={tierFilter === tier} onClick={() => setTierFilter(tier)}>
              {t(TIER_STYLE[tier].label)} {tiers[tier] ?? 0}
            </Chip>
          ))}
          {data ? (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {t("gates", { solvency: data.gates.solvency, liquidity: data.gates.liquidity })}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? <PanelUnavailable label={t("title")} reason={t("error")} /> : null}

      {isLoading ? (
        <PanelPending label={t("title")} text={t("loading")} />
      ) : (
        <DataTable<DeskRow>
          caption={isCsp ? t("tableCaptionCsp") : t("tableCaptionCc")}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.ticker}
          rowHref={(r) => `/stock/${r.ticker}`}
          defaultSort={{ key: "score", dir: "desc" }}
          filters={filters}
        />
      )}

    </div>
  );
}
