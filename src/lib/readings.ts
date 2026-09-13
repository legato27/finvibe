/**
 * Readings — the sentences the pages lead with, composed from data.
 *
 * Pure: no fetching, no React, no next-intl, relative imports only, so
 * `node --test` runs it and the MCP server composes the same answers the
 * pages show. The strip, the sector card, the week panel, the book-risk
 * panel and the track record each have a composer here.
 */
import { agreement, cycleLean, regimeColorLean, swarmLean, vixLean, type Lean, type LeanRow } from "./lean.ts";
import type { BookRisk } from "./bookRisk.ts";
import { summarize, type GradedTrade } from "./trackRecord.ts";
import { horizon, type CalEvent } from "./calendar/us.ts";

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function closesOf(res: { data?: Array<Record<string, unknown>> } | undefined | null) {
  if (!res?.data) return [];
  return res.data.map((row) => ({
    time: String(row.Date ?? row.date ?? "").slice(0, 10),
    close: Number(row.Close ?? row.close ?? 0),
  }));
}

const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);

// ── Today ──────────────────────────────────────────────────────────────

export type DashboardPayload = {
  today?: {
    date?: string; regime?: string; regime_color?: string; risk_score?: number;
    signals?: Array<{ signal: string; impact?: string; weight?: string }>;
    inputs_missing?: string[]; positioning?: unknown; score_components?: unknown; generated_at?: string; error?: unknown;
  };
  vix?: { zone?: string } & Record<string, unknown>;
  vix_term_structure?: unknown;
  swarm?: { signal_type?: string } & Record<string, unknown>;
  business_cycle?: { state?: string } & Record<string, unknown>;
  breadth?: unknown; gex?: unknown; sector_rotation?: unknown; regime_sectors?: unknown;
};
export type DigestPayload = {
  new_pam_triggers?: Array<{ ticker: string; setup: string; direction: string | null; conviction: number | null }>;
  verdict_changes?: Array<{ ticker: string; from: string; to: string; at: string }>;
  conflicts?: Array<{ ticker: string; between: string[]; explanation: string | null }>;
};

export function composeTodayReading(dash: DashboardPayload, digest: DigestPayload | null) {
  const today = dash.today;
  if (!today || today.error || today.risk_score == null) {
    return { available: false as const, reading: "The regime feed did not answer, so there is no call today." };
  }
  const lean: Lean = regimeColorLean(today.regime_color) ?? "neutral";
  const rows = (
    [
      { label: "Today", lean: regimeColorLean(today.regime_color) },
      { label: "VIX", lean: vixLean(dash.vix?.zone) },
      { label: "Swarm", lean: swarmLean(dash.swarm?.signal_type) },
      { label: "Cycle", lean: cycleLean(dash.business_cycle?.state) },
    ] as Array<{ label: string; lean: Lean | null }>
  ).filter((r): r is LeanRow => r.lean !== null);
  const agg = agreement(rows);
  const list = (l: Lean) => rows.filter((r) => r.lean === l).map((r) => r.label);
  const clauses: string[] = [];
  if (list("on").length) clauses.push(`${joinList(list("on"))} lean risk-on`);
  if (list("off").length) clauses.push(`${joinList(list("off"))} lean risk-off`);
  if (list("neutral").length) clauses.push(`${joinList(list("neutral"))} sit neutral`);
  const signals = today.signals ?? [];
  const watch = signals.find((s) => s.weight === "high") ?? signals.find((s) => s.weight === "medium") ?? signals[0];
  const score = today.risk_score;
  const leanWord = lean === "on" ? "Lean in" : lean === "off" ? "Lean out" : "Stay balanced";
  const top3 = [...(digest?.new_pam_triggers ?? [])]
    .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0))
    .slice(0, 3);
  const fired = (digest?.new_pam_triggers?.length ?? 0) + (digest?.verdict_changes?.length ?? 0) + (digest?.conflicts?.length ?? 0);

  const parts = [
    `${leanWord}. ${today.regime} at a risk score of ${score > 0 ? "+" : ""}${score.toFixed(0)}.`,
    agg.headline === "conflict" ? `Models conflict: ${clauses.join("; ")}.` : `${agg.agree} of ${rows.length} agree: ${clauses.join("; ")}.`,
  ];
  if (watch) parts.push(`Macro watch: ${watch.signal}.`);
  if (top3.length) {
    parts.push(
      `Top signals: ${top3.map((s) => `${s.ticker} ${s.setup}${s.direction ? ` ${s.direction}` : ""}${s.conviction != null ? ` (${Math.round(s.conviction)})` : ""}`).join(", ")}.`,
    );
  }
  if (digest) parts.push(`${fired} signal${fired === 1 ? "" : "s"} fired today.`);
  if (today.inputs_missing?.length) parts.push(`${today.inputs_missing.length} input${today.inputs_missing.length === 1 ? "" : "s"} missing.`);

  return {
    available: true as const,
    reading: parts.join(" "),
    date: today.date ?? null,
    lean,
    regime: today.regime ?? null,
    risk_score: score,
    models: rows,
    agreement: agg,
    macro_watch: watch ?? null,
    top_signals: top3,
    fired_today: digest ? fired : null,
    inputs_missing: today.inputs_missing ?? [],
    generated_at: today.generated_at ?? null,
  };
}

// ── Sectors ────────────────────────────────────────────────────────────

export type SectorRow = {
  sector: string; n: number; market_cap: number;
  chg_1d: number | null; ret_1w: number | null; ret_1m: number | null; ret_ytd: number | null;
  advancers: number; decliners: number; n_long: number; n_short: number;
};
export type SectorWindow = "chg_1d" | "ret_1w" | "ret_1m" | "ret_ytd";
export const WINDOW_LABEL: Record<SectorWindow, string> = { chg_1d: "day", ret_1w: "week", ret_1m: "month", ret_ytd: "year-to-date" };

export function composeSectorReading(rows: SectorRow[], win: SectorWindow) {
  const scored = rows.filter((s) => s.sector !== "Unclassified" && s[win] != null).sort((a, b) => (b[win] ?? 0) - (a[win] ?? 0));
  if (!scored.length) {
    return { reading: `The ${WINDOW_LABEL[win]} window has no returns yet: the box has not computed them since the last close.`, up: 0, total: 0, leader: null, laggard: null, market: null };
  }
  const up = scored.filter((s) => (s[win] ?? 0) > 0).length;
  const cap = scored.reduce((a, s) => a + s.market_cap, 0);
  const marketRet = cap ? scored.reduce((a, s) => a + (s[win] ?? 0) * s.market_cap, 0) / cap : null;
  const leader = scored[0], laggard = scored[scored.length - 1];
  const d = win === "chg_1d" ? 2 : 1;
  return {
    reading: `${up} of ${scored.length} sectors up on the ${WINDOW_LABEL[win]}. ${leader.sector} led at ${pct(leader[win], d)}; ${laggard.sector} lagged at ${pct(laggard[win], d)}. Cap-weighted ${pct(marketRet, d)}.`,
    up, total: scored.length,
    leader: { sector: leader.sector, value: leader[win] },
    laggard: { sector: laggard.sector, value: laggard[win] },
    market: marketRet,
  };
}

// ── Week ahead ─────────────────────────────────────────────────────────

export type InflationRow = { month: string; cpi_yoy: number | null; cpi_core_yoy: number | null; pce_yoy: number | null; pce_core_yoy: number | null };
export type InflationPayload = { rows?: InflationRow[]; latest?: { cpi: InflationRow | null; pce: InflationRow | null }; expectations?: unknown; target?: number };

const MONTH_EN = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const WEEKDAY_EN = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
export const KIND_LABEL: Record<CalEvent["kind"], string> = {
  fomc: "Fed decision", cpi: "CPI", pce: "PCE inflation", jobs: "Jobs report", opex: "Monthly opex",
  witching: "Quad witching", holiday: "Market closed", early_close: "Early close", earnings: "Earnings", ex_div: "Ex-dividend",
};

export function annotateInflation(e: CalEvent, inflation: InflationPayload | null): CalEvent {
  if (!inflation || (e.kind !== "cpi" && e.kind !== "pce")) return e;
  const rows = inflation.rows ?? [];
  const key = e.kind === "cpi" ? "cpi_yoy" : "pce_yoy";
  const coreKey = e.kind === "cpi" ? "cpi_core_yoy" : "pce_core_yoy";
  const releaseYear = Number(e.date.slice(0, 4));
  const refYear = e.detail === "December" && e.date.slice(5, 7) === "01" ? releaseYear - 1 : releaseYear;
  const idx = rows.findIndex((r) => r[key] != null && r.month.slice(0, 4) === String(refYear) && MONTH_EN.format(new Date(`${r.month}T00:00:00Z`)) === e.detail);
  const f = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
  if (idx >= 0) {
    const r = rows[idx];
    return { ...e, note: `${f(r[key])} y/y · core ${f(r[coreKey])}` };
  }
  const latest = e.kind === "cpi" ? inflation.latest?.cpi : inflation.latest?.pce;
  return latest ? { ...e, note: `last ${MONTH_EN.format(new Date(`${latest.month}T00:00:00Z`))}: ${f(latest[key])} y/y · core ${f(latest[coreKey])}` } : e;
}

export function composeWeekReading(events: CalEvent[], held: Set<string>, opts: { hasNames: boolean; to: string; latestCpi: InflationRow | null }) {
  const highs = events.filter((e) => e.weight === "high" && e.kind !== "earnings").slice(0, 3);
  const reporting = events.filter((e) => e.kind === "earnings").reduce((n, e) => n + (e.tickers?.length ?? 0), 0);
  const heldReporting = events.filter((e) => e.kind === "earnings").reduce((n, e) => n + (e.tickers ?? []).filter((t) => held.has(t)).length, 0);
  const s: string[] = [];
  if (highs.length) s.push(`This week: ${joinList(highs.map((e) => `${KIND_LABEL[e.kind]} ${WEEKDAY_EN.format(new Date(`${e.date}T00:00:00Z`))}`))}.`);
  else if (!events.length) s.push("A quiet week: nothing scheduled.");
  if (reporting) s.push(`${reporting} of your names report.`);
  if (heldReporting) s.push(`${heldReporting} held name${heldReporting === 1 ? " is" : "s are"} inside an earnings window.`);
  if (!opts.hasNames) s.push("No names attached: the token has no watchlist or holdings.");
  if (opts.to > horizon()) s.push(`The schedule is known through ${horizon()}; later weeks may be incomplete.`);
  if (opts.latestCpi && opts.latestCpi.cpi_yoy != null) s.push(`Latest CPI ${opts.latestCpi.cpi_yoy.toFixed(1)}% y/y, core ${opts.latestCpi.cpi_core_yoy?.toFixed(1) ?? "—"}%; the Fed targets 2%.`);
  return s.join(" ");
}

// ── Book risk ──────────────────────────────────────────────────────────

export function composeBookReading(r: BookRisk): string {
  const largest = r.largest;
  const pctL = largest ? Math.round(largest.weight * 100) : 0;
  const members = largest ? largest.members.slice(0, 3).join(", ") : "";
  const bets = r.effectiveBets >= 10 ? r.effectiveBets.toFixed(0) : r.effectiveBets.toFixed(1);
  const lead = r.effectiveBets >= r.names * 0.85
    ? `Your ${r.names} names move independently of each other. The largest is ${pctL}% of value: ${members}.`
    : `Your book behaves like ${bets} bets, not ${r.names} names. The largest bet is ${pctL}% of value: ${members}.`;
  const beta = r.bookBeta != null ? ` Beta to SPY ${r.bookBeta.toFixed(2)}.` : "";
  const excl = r.excluded.length ? ` ${r.excluded.length} name${r.excluded.length === 1 ? " has" : "s have"} no usable history and count as their own bet.` : "";
  return lead + beta + excl;
}

// ── Track record ───────────────────────────────────────────────────────

export type Scorecard = { by_strategy?: Record<string, { n: number; win_rate: number }> };

export function composeTrackReading(graded: GradedTrade[], engine: Scorecard | null, strategy: "csp" | "covered_call"): string {
  const s = summarize(graded);
  const noun = strategy === "covered_call" ? "covered calls" : "short puts";
  const block = engine?.by_strategy?.[strategy === "covered_call" ? "sell_calls" : "sell_puts"];
  const p = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
  const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (!s.settled) return "No settled trades yet. Log a trade and resolve it at expiry to start a record.";
  const parts: string[] = [];
  parts.push(s.settled >= 5 ? `Your ${s.settled} settled trades: ${s.won} won, ${p(s.winRate)}.` : `${s.settled} settled trade${s.settled === 1 ? "" : "s"}: ${s.won} won. Five are needed before a rate is worth reading.`);
  parts.push(block && block.n ? `The engine won ${p(block.win_rate)} of the ${block.n} ${noun} it recommended.` : `The engine has no graded ${noun} yet.`);
  if (s.earlyClosed && s.earlyCloseCost != null) parts.push(`You closed ${s.earlyClosed} early; holding to expiry would have ${s.earlyCloseCost > 0 ? "added" : "cost"} ${usd(Math.abs(s.earlyCloseCost))}.`);
  if (s.matched >= 3 && s.meanPop != null && s.calibrationGap != null) {
    parts.push(`On the ${s.matched} trades the engine priced, it predicted ${p(s.meanPop)} and you delivered ${p(s.meanPop - s.calibrationGap)}: ${s.calibrationGap > 0 ? "+" : ""}${(s.calibrationGap * 100).toFixed(1)} points ${s.calibrationGap > 0 ? "optimistic" : "conservative"}.`);
  }
  return parts.join(" ");
}
