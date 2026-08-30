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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { optionsApi } from "@/lib/api";
import DataTable, { Column } from "@/components/ui/DataTable";
import type { FilterDef } from "@/components/shared/ColumnFilters";
import { ScreenerTabs } from "@/components/shared/ScreenerTabs";
import { WatchlistStar } from "@/components/shared/WatchlistStar";
import { LastUpdated } from "@/components/common/LastUpdated";
import GuideCard from "@/components/ui/GuideCard";
import VerdictBadge, { VerdictState } from "@/components/ui/VerdictBadge";
import { ShieldAlert, ShieldCheck, TrendingDown, Landmark } from "lucide-react";
import SizedBook, { type Book } from "@/components/stock/SizedBook";
import AssignmentBacktest from "@/components/stock/AssignmentBacktest";
import CoveredCallBook from "@/components/stock/CoveredCallBook";
import RecoTrackRecord from "@/components/stock/RecoTrackRecord";
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
  qualified: { label: "Qualified", cls: "text-signal-long bg-signal-long-bg border-signal-long/40" },
  watch: { label: "Watch", cls: "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/40" },
  rejected: { label: "Rejected", cls: "text-signal-short bg-signal-short-bg border-signal-short/40" },
};

/** Days until an earnings print, or null when we have no date. */
function daysToEarnings(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

export default function OptionDeskPage() {
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

  const deskAsOf = allRows.reduce<string | null>(
    (max, r) => (r.summary_date && (!max || r.summary_date > max) ? r.summary_date : max),
    null,
  );

  const filters: FilterDef<DeskRow>[] = [
    { key: "ticker", label: "Ticker", kind: "text", value: (r) => r.ticker },
    { key: "sector", label: "Sector", kind: "select", value: (r) => r.sector ?? "" },
    { key: "bucket", label: "Correlation bucket", kind: "select", value: (r) => r.correlation_bucket ?? "" },
    { key: "tier", label: "Tier", kind: "select", value: (r) => r.tier },
    { key: "score", label: "Score", kind: "number", value: (r) => Math.round(r.score * 100) },
    { key: "ivp", label: "IV percentile", kind: "number", value: (r) => r.iv_percentile },
    { key: "fscore", label: "F-Score", kind: "number", value: (r) => r.f_score },
    { key: "ouz", label: "OU z-score", kind: "number", value: (r) => r.ou_z_score },
    { key: "ann", label: "Annualized %", kind: "number", value: (r) => r.annualized_return_pct },
    { key: "dte", label: "DTE", kind: "number", value: (r) => r.dte },
  ];

  const columns: Column<DeskRow>[] = [
    {
      key: "ticker",
      header: "Ticker",
      sortable: true,
      sortValue: (r) => r.ticker,
      cell: (r) => (
        <span>
          <span className="font-mono font-bold">{r.ticker}</span>
          {r.is_etf ? (
            <span
              className="ml-1.5 rounded border border-border px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              title="Fund — no issuer solvency to gate on, and no F-Score or DCF to score. Judged on volatility, dislocation and yield only."
            >
              ETF
            </span>
          ) : null}
          <span className="ml-2 hidden text-xs text-muted-foreground lg:inline">{r.name}</span>
        </span>
      ),
    },
    {
      // Outside the first cell — that one carries the row-stretched link and a
      // button cannot nest inside it.
      key: "watch",
      header: <span aria-hidden="true">★</span>,
      ariaLabel: "Watchlist",
      cell: (r) => <WatchlistStar ticker={r.ticker} />,
    },
    {
      key: "tier",
      header: "Tier",
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
            {s.label}
          </span>
        );
      },
    },
    {
      key: "score",
      header: "Score",
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
                    : `${k}: ${v == null ? "not measured" : v.toFixed(2)}`)
                .join("\n") +
              `\n\n${Math.round(r.score_coverage * 100)}% of the applicable weight is informed` +
              (thin ? " — too thin to qualify on" : "")
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
      header: "Verdict",
      sortable: true,
      sortValue: (r) => r.verdict ?? "",
      hideBelow: "lg",
      cell: (r) => <VerdictBadge state={(r.verdict ?? null) as VerdictState} />,
    },
    // ── the two hard gates, made visible ──────────────────────────────────
    {
      key: "solvency",
      header: "Altman",
      ariaLabel: "Altman Z solvency",
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
      header: "Strike OI",
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => r.strike_oi,
      cell: (r) => <span className="nums">{r.strike_oi?.toLocaleString() ?? "—"}</span>,
    },
    // ── the scored inputs ─────────────────────────────────────────────────
    {
      key: "ivp",
      header: "IV %ile",
      ariaLabel: "IV percentile",
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
      header: "ATM IV",
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => r.atm_iv_pct,
      cell: (r) => <span className="nums">{fmt(r.atm_iv_pct, 1, "%")}</span>,
    },
    {
      key: "fscore",
      header: "F",
      ariaLabel: "Piotroski F-Score",
      sortable: true,
      align: "right",
      sortValue: (r) => r.f_score,
      cell: (r) => (
        <span className="nums" title="Piotroski F-Score (0-9)">
          {r.f_score == null ? "—" : `${r.f_score}/9`}
        </span>
      ),
    },
    {
      key: "ouz",
      header: "OU z",
      ariaLabel: "Ornstein-Uhlenbeck z-score",
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
      header: isCsp ? "Put strike" : "Call strike",
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
              title={isCsp ? undefined : "Use the gamma wall and your own cost basis"}
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
                ? "Targeted today from the recorded per-strike quote band, chosen for open interest near the target delta"
                : "Inherited from the recommendation engine's last logged entry"
            }
          >
            ${r.strike}
            {!fresh ? <span className="ml-1 text-[10px] text-muted-foreground">logged</span> : null}
          </span>
        );
      },
    },
    ...(isCsp
      ? []
      : ([
          {
            key: "wall",
            header: "Resistance",
            ariaLabel: "Lowest resistance level above spot",
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
            header: "Max pain",
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
      header: "DTE",
      sortable: true,
      align: "right",
      sortValue: (r) => r.dte,
      cell: (r) => <span className="nums">{r.dte ?? "—"}</span>,
    },
    {
      key: "delta",
      header: "Δ",
      ariaLabel: "Delta",
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => (r.delta == null ? null : Math.abs(r.delta)),
      cell: (r) => <span className="nums">{fmt(r.delta == null ? null : Math.abs(r.delta), 2)}</span>,
    },
    {
      key: "prem",
      header: "Premium",
      sortable: true,
      align: "right",
      sortValue: (r) => r.premium_est,
      cell: (r) => <span className="nums">{r.premium_est == null ? "—" : `$${r.premium_est.toFixed(2)}`}</span>,
    },
    {
      key: "ann",
      header: "Ann. %",
      ariaLabel: "Annualized return on collateral",
      sortable: true,
      align: "right",
      sortValue: (r) => r.annualized_return_pct,
      cell: (r) => (
        <span
          className="nums"
          title="Priced off the engine's estimate, which assumes a mid fill. The current market-data plan returns no bid/ask, so this is an upper bound."
        >
          {fmt(r.annualized_return_pct, 1, "%")}
        </span>
      ),
    },
    {
      key: "be",
      header: "Breakeven",
      sortable: true,
      align: "right",
      optional: true,
      sortValue: (r) => r.breakeven,
      cell: (r) => <span className="nums">{r.breakeven == null ? "—" : `$${r.breakeven.toFixed(2)}`}</span>,
    },
    {
      key: "earn",
      header: "Earnings",
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
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
      <ScreenerTabs />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Landmark className="h-5 w-5 text-primary" />
            Option desk
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Candidates for selling puts and covered calls, graded rather than filtered. Two hard
            gates — solvency and liquidity — then a weighted score. Names that fail a gate stay on
            the list with the reason, so a thin top tier explains itself.
          </p>
        </div>
        <LastUpdated at={deskAsOf} />
      </header>

      {/* Strategy switch */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "csp" as const, label: "Sell puts", icon: TrendingDown, caption: "Cash-secured, 7-45 DTE" },
            { id: "covered_call" as const, label: "Covered calls", icon: ShieldCheck, caption: "Against shares you hold" },
          ]
        ).map(({ id, label, icon: Icon, caption }) => {
          const active = strategy === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStrategy(id)}
              aria-pressed={active}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-card hover:border-primary/30 hover:bg-accent"
              }`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className="flex flex-col leading-tight">
                <span className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                  {label}
                </span>
                <span className="text-[11px] text-muted-foreground">{caption}</span>
              </span>
            </button>
          );
        })}
      </div>

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

      <TradeJournal />

      <AssignmentBacktest />

      <RecoTrackRecord />

      <GuideCard
        title="How to read this desk"
        intro={
          "The edge being harvested is the volatility risk premium: implied vol usually prints above what the " +
          "underlying goes on to realize. Everything here is in service of collecting that without being handed " +
          "shares you did not want."
        }
        sections={[
          {
            title: "The two hard gates",
            tone: "plain",
            steps: [
              "Solvency — a name is only excluded when Altman classifies it as Distress. Assignment means owning the shares, so the gate asks whether the company survives, not whether it is cheap.",
              "Liquidity — strike open interest of at least 500 and an underlying above $10. Below that the quoted premium is not obtainable: on a $0.25 credit the spread can be 20-40% of the trade.",
              "Altman's grey zone is uncertainty, not insolvency, so grey names stay on the list and are scored down instead.",
            ],
          },
          {
            title: "What moves the score",
            tone: "long",
            steps: [
              "IV percentile (30%) — how rich this name's implied vol is against its OWN year. Below the 50th percentile earns nothing; you would be selling cheap.",
              "Piotroski F-Score (25%) — the willing-to-own test.",
              "OU z-score (20%) — how far below its statistical equilibrium the price sits. Positive z earns nothing: selling puts into strength is what gets run over.",
              "Annualized return (15%), capped at 40% — uncapped, yield alone ranks a 150%-annualized penny stock above every quality signal.",
              "Margin of safety (10%) — the smallest weight on purpose. The DCF behind it is missing for 37% of the universe and is unreliable on high-growth names.",
              "Where an input is missing the weight is redistributed, not scored zero — a measurement gap should not read as a finding.",
            ],
          },
          {
            title: "Funds are judged differently",
            tone: "plain",
            steps: [
              "ETFs are in the book now. A fund has no issuer to go bankrupt, so the solvency gate asks a different question: whether the fund's STRUCTURE survives being held.",
              "Leveraged, inverse and option-overlay funds are rejected outright. A daily-reset 2X fund decays through volatility and a 0DTE covered-call fund has already sold the upside — assignment leaves you holding something engineered to grind down, so \"happy to own it\" can never be true.",
              "F-Score and margin of safety are marked n/a rather than missing, and dropped from the denominator. A fund is scored on volatility premium, dislocation and yield alone, so it is not penalised for failing to be a company.",
              "A greyed score with a percentage next to it means only that share of the applicable weight was actually measured — read it as a hint, not a rating.",
            ],
          },
          {
            title: "Before you write anything",
            tone: "short",
            steps: [
              "Check the Earnings column. A print inside the contract's life is flagged red — that is the most reliable way to turn a premium grind into a gap loss.",
              "For covered calls, resistance is the LOWEST of three independent reads: the nearest volume shelf above spot (where holders have basis and supply appears), the heaviest call open-interest strike (where dealer hedging pushes back), and max pain. Lowest, because a covered call is capped upside — being early is cheap and being late is what costs.",
              "A dash in the Resistance column means the price has cleared all three. That is information, not a gap: there is no overhead supply, so a rally has nothing structural to get through. Sell further out, or do not sell the call at all.",
              "Your strike must be above BOTH resistance and your own cost basis. The Covered calls panel joins your portfolio to these levels in your browser — your basis is never sent upstream.",
              "Annualized figures assume a mid fill. The current market-data plan returns no bid/ask, so treat every return here as an upper bound rather than an expectation.",
              "IV percentile is shown instead of IV rank throughout. Rank is a min/max statistic that one bad print flattens for a year.",
            ],
          },
        ]}
        footnote={
          "Nothing on this page places an order. It reads persisted daily data — no live chain fetches, no broker connection."
        }
      />

      {/* Tier counts double as the tier filter. */}
      {tiers ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTierFilter("all")}
            aria-pressed={tierFilter === "all"}
            className={`rounded border px-2 py-1 font-medium ${
              tierFilter === "all" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card"
            }`}
          >
            All {data?.universe_size ?? 0}
          </button>
          {(["qualified", "watch", "rejected"] as Tier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTierFilter(t)}
              aria-pressed={tierFilter === t}
              className={`rounded border px-2 py-1 font-medium ${
                tierFilter === t ? TIER_STYLE[t].cls : "border-border bg-card text-muted-foreground"
              }`}
            >
              {TIER_STYLE[t].label} {tiers[t] ?? 0}
            </button>
          ))}
          {data ? (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
              Gates: {data.gates.solvency} · {data.gates.liquidity}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-signal-short/40 bg-signal-short-bg p-3 text-sm text-signal-short">
          Could not load the desk. The upstream analytics box may be unreachable — the screener tab
          will still work from cached data.
        </p>
      ) : null}

      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading the desk…</p>
      ) : (
        <DataTable<DeskRow>
          caption={`Option desk — ${isCsp ? "short put" : "covered call"} candidates`}
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
