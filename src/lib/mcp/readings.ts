/**
 * MCP readings — fetch, then compose with the same pure composers the
 * pages' sentences come from (`@/lib/readings`). Everything user-scoped
 * filters on the token's user id: the service client bypasses RLS, so the
 * filter here is the ownership boundary.
 */
import type { ServiceSupabase } from "@/lib/supabase/service";
import { market } from "@/lib/mcp/market";
import { pooledMap } from "@/lib/util/pool";
import { convert, inferCurrency, type Currency, type FxRates } from "@/lib/currency";
import { computeBookRisk, logReturns, type PositionInput } from "@/lib/bookRisk";
import { cohorts, gradeTrades, summarize, type LogRow, type TradeInput } from "@/lib/trackRecord";
import { addDays, mergeEvents, scheduledEvents, weekOf, type CalEvent } from "@/lib/calendar/us";
import { groupByQuadrant, relativeRotation, type Quadrant } from "@/lib/rotation";
import {
  annotateInflation, closesOf, composeBookReading, composeSectorReading, composeTodayReading,
  composeTrackReading, composeWeekReading, joinList, KIND_LABEL,
  type DashboardPayload, type DigestPayload, type InflationPayload, type Scorecard, type SectorRow, type SectorWindow,
} from "@/lib/readings";

type HistoryResponse = { data?: Array<Record<string, unknown>> };
const isoToday = () => new Date().toISOString().slice(0, 10);

// ── Today ──────────────────────────────────────────────────────────────

export async function readToday(detail: boolean) {
  const [dash, digest] = await Promise.all([
    market.dashboard() as Promise<DashboardPayload>,
    (market.signalsToday() as Promise<DigestPayload>).catch(() => null),
  ]);
  const reading = composeTodayReading(dash, digest);
  if (!detail) return reading;
  return {
    ...reading,
    components: {
      today: dash.today ?? null, vix: dash.vix ?? null, vix_term_structure: dash.vix_term_structure ?? null,
      breadth: dash.breadth ?? null, gex: dash.gex ?? null, business_cycle: dash.business_cycle ?? null,
      swarm: dash.swarm ?? null, sector_rotation: dash.sector_rotation ?? null, regime_sectors: dash.regime_sectors ?? null,
      signals_digest: digest,
    },
  };
}

// ── Sectors ────────────────────────────────────────────────────────────

const ETF_GICS: Record<string, string> = {
  XLK: "Information Technology", XLY: "Consumer Discretionary", XLF: "Financials", XLI: "Industrials",
  XLB: "Materials", XLRE: "Real Estate", XLC: "Communication Services", XLE: "Energy",
  XLV: "Health Care", XLP: "Consumer Staples", XLU: "Utilities",
};

export async function readSectorPulse(win: SectorWindow) {
  const sectorsRes = (await market.sectors()) as { as_of?: unknown; count?: number; sectors: SectorRow[] };
  const rows = (sectorsRes.sectors ?? []).filter((s) => s.sector !== "Unclassified");
  const sectorReading = composeSectorReading(rows, win);

  const rotationRows = ((await market.sectorRotation().catch(() => [])) as Array<{ sector: string; etf_ticker: string; rs_rank?: number }>) ?? [];
  const tickers = [...rotationRows.map((r) => r.etf_ticker), "SPY"];
  const histories = await pooledMap(tickers, 4, (t) => (market.priceHistory(t, "6mo", "1d") as Promise<HistoryResponse>).catch(() => null));
  const bench = closesOf(histories[tickers.length - 1]);
  const caps = new Map(rows.map((s) => [s.sector, s.market_cap]));
  const quad = rotationRows.flatMap((r, i) => {
    const rr = bench.length ? relativeRotation(closesOf(histories[i]), bench) : null;
    return rr
      ? [{ sector: r.sector, etf: r.etf_ticker, quadrant: rr.quadrant, rs_ratio: +rr.current.x.toFixed(2), rs_momentum: +rr.current.y.toFixed(2), market_cap: caps.get(ETF_GICS[r.etf_ticker] ?? "") ?? null, rs_rank: r.rs_rank ?? null }]
      : [];
  });
  const groups = groupByQuadrant(quad);
  const names = (q: Quadrant) => groups[q].map((s) => s.sector);
  const rot: string[] = [];
  if (groups.leading.length) rot.push(`${joinList(names("leading"))} lead.`);
  if (groups.improving.length) rot.push(`${joinList(names("improving"))} improving.`);
  if (groups.weakening.length) rot.push(`${joinList(names("weakening"))} weakening.`);
  if (groups.lagging.length) rot.push(`${joinList(names("lagging"))} lag.`);

  return {
    reading: [sectorReading.reading, ...rot].join(" "),
    window: win,
    sectors: [...rows].sort((a, b) => (b[win] ?? -Infinity) - (a[win] ?? -Infinity)),
    rotation: quad,
    as_of: sectorsRes.as_of ?? null,
    note: "Rotation axes: relative strength = the ETF/SPY ratio against its three-month mean, 100 = in line with the market; momentum = that ratio against its ten-day mean. Leading, weakening, lagging, improving run clockwise.",
  };
}

// ── Week ahead ─────────────────────────────────────────────────────────

type EventsResponse = { earnings_date?: string | null; ex_dividend_date?: string | null };

async function userNames(userId: string, supabase: ServiceSupabase) {
  const [{ data: items }, { data: holdings }] = await Promise.all([
    supabase.from("watchlist_items").select("stock_catalog(ticker), watchlists!inner(user_id)").eq("watchlists.user_id", userId),
    supabase.from("portfolio_holdings").select("ticker").eq("user_id", userId),
  ]);
  const held = new Set<string>((holdings ?? []).map((h: { ticker: string }) => h.ticker.toUpperCase()));
  const names = new Set<string>(held);
  for (const it of (items ?? []) as Array<{ stock_catalog?: { ticker?: string } | null }>) {
    const t = it.stock_catalog?.ticker;
    if (t) names.add(t.toUpperCase());
  }
  return { held, names };
}

export async function readWeekAhead(userId: string, supabase: ServiceSupabase, weeks: number) {
  const today = isoToday();
  const week = weekOf(today);
  const to = addDays(week.from, weeks * 7 - 1);
  const scheduled = scheduledEvents(week.from, to);
  const [inflation, { held, names }] = await Promise.all([
    (market.inflation() as Promise<InflationPayload>).catch(() => null),
    userNames(userId, supabase),
  ]);
  const list = [...names].sort().slice(0, 60);
  const events = await pooledMap(list, 6, (t) => (market.events(t) as Promise<EventsResponse>).catch(() => null));
  const named: CalEvent[] = [];
  list.forEach((t, i) => {
    const d = events[i];
    if (!d) return;
    const e = d.earnings_date?.slice(0, 10);
    if (e && e >= week.from && e <= to) named.push({ date: e, kind: "earnings", tickers: [t], weight: held.has(t) ? "high" : "medium" });
    const x = d.ex_dividend_date?.slice(0, 10);
    if (x && x >= week.from && x <= to) named.push({ date: x, kind: "ex_div", tickers: [t], weight: "low" });
  });
  const merged = mergeEvents(scheduled, named).map((e) => annotateInflation(e, inflation));
  const thisWeek = merged.filter((e) => e.date <= week.to);
  return {
    reading: composeWeekReading(thisWeek, held, { hasNames: names.size > 0, to, latestCpi: inflation?.latest?.cpi ?? null }),
    week,
    through: to,
    events: merged.map((e) => ({ ...e, label: KIND_LABEL[e.kind], time_et: e.timeEt ?? null, held: (e.tickers ?? []).some((t) => held.has(t)) })),
    names_checked: list.length,
    names_total: names.size,
    inflation: inflation ? { latest: inflation.latest ?? null, expectations: inflation.expectations ?? null, target: inflation.target ?? 2 } : null,
  };
}

// ── Book risk ──────────────────────────────────────────────────────────

type HoldingRow = { ticker: string; shares: number; cost_basis: number; currency: string | null; portfolio_id: number };

export async function readBookRisk(userId: string, supabase: ServiceSupabase, portfolioId?: number) {
  const { data: profile } = await supabase.from("profiles").select("default_currency").eq("id", userId).maybeSingle();
  const currency = ((profile?.default_currency as Currency) || "USD");
  let q = supabase.from("portfolio_holdings").select("ticker, shares, cost_basis, currency, portfolio_id").eq("user_id", userId);
  if (portfolioId != null) q = q.eq("portfolio_id", portfolioId);
  const { data: holdings, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (holdings ?? []) as HoldingRow[];
  if (rows.length < 2) return { available: false, reading: rows.length ? "Add a second holding to see how your positions move together." : "No holdings.", names: rows.length };

  const tickers = [...new Set(rows.map((h) => h.ticker.toUpperCase()))].sort();
  const [{ data: stocks }, fx] = await Promise.all([
    supabase.from("stock_catalog").select("ticker, last_price, name, sector").in("ticker", tickers),
    (market.fxRates(currency) as Promise<FxRates>).catch(() => undefined),
  ]);
  const catalog = new Map((stocks ?? []).map((s: { ticker: string; last_price: number | null; name?: string; sector?: string }) => [s.ticker, s]));
  const byTicker = new Map<string, PositionInput>();
  let unconverted = 0;
  for (const h of rows) {
    const t = h.ticker.toUpperCase();
    const native = ((h.currency as Currency) || inferCurrency(t));
    const price = catalog.get(t)?.last_price || h.cost_basis;
    const value = convert(h.shares * price, native, currency, fx);
    if (value == null) { unconverted += 1; continue; }
    const cur = byTicker.get(t);
    if (cur) cur.value += value; else byTicker.set(t, { ticker: t, value, name: catalog.get(t)?.name, sector: catalog.get(t)?.sector });
  }
  const positions = [...byTicker.values()];
  const wanted = [...positions.map((p) => p.ticker), "SPY"];
  const histories = await pooledMap(wanted, 4, (t) => (market.priceHistory(t, "6mo", "1d") as Promise<HistoryResponse>).catch(() => null));
  const returns: Record<string, Map<string, number>> = {};
  let bench: Map<string, number> | undefined;
  wanted.forEach((t, i) => {
    const r = logReturns(closesOf(histories[i]));
    if (t === "SPY") bench = r.size ? r : undefined; else if (r.size) returns[t] = r;
  });
  const ranked = await (market.rankedBook() as Promise<{ ranked?: Array<{ ticker: string; factors?: Record<string, number> }> }>).catch(() => null);
  const factors: Record<string, Record<string, number>> = {};
  for (const row of ranked?.ranked ?? []) if (row.factors) factors[row.ticker.toUpperCase()] = row.factors;
  const risk = computeBookRisk({ positions, returns, market: bench, factors });
  return {
    available: true,
    reading: composeBookReading(risk),
    currency,
    unconverted_lots: unconverted,
    names: risk.names,
    effective_bets: +risk.effectiveBets.toFixed(2),
    largest_bet: risk.largest,
    book_beta: risk.bookBeta,
    clusters: risk.clusters,
    excluded: risk.excluded,
    window: risk.window,
    factor_tilt: risk.tilt,
    tilt_coverage: +risk.tiltCoverage.toFixed(2),
    threshold: risk.threshold,
  };
}

// ── Quant ──────────────────────────────────────────────────────────────

export async function readRankedBook(userId: string, supabase: ServiceSupabase, mine: boolean) {
  const [book, performance] = await Promise.all([
    market.rankedBook() as Promise<{ ranked?: Array<{ ticker: string }> } & Record<string, unknown>>,
    market.rankedBookPerformance().catch(() => null),
  ]);
  if (!mine) return { ...book, performance };
  const { names } = await userNames(userId, supabase);
  return { ...book, ranked: (book.ranked ?? []).filter((r) => names.has(r.ticker.toUpperCase())), performance, filtered_to: names.size };
}

type HeatmapRow = {
  ticker: string; name?: string; sector?: string; sub_industry?: string; indices?: string[]; tier?: string;
  market?: Record<string, unknown>; signals?: Record<string, unknown>;
};

export async function readHeatmap(userId: string, supabase: ServiceSupabase, sector: string | undefined, universe: "both" | "spx" | "ndx" | "book") {
  if (!sector && universe === "both") return market.sectors();
  const payload = (await market.heatmap()) as { as_of?: unknown; rows?: HeatmapRow[]; names?: HeatmapRow[] } & Record<string, unknown>;
  let rows = (payload.rows ?? payload.names ?? []) as HeatmapRow[];
  if (universe === "spx" || universe === "ndx") {
    const tag = universe.toUpperCase();
    rows = rows.filter((r) => (r.indices ?? []).includes(tag));
  } else if (universe === "book") {
    const { names } = await userNames(userId, supabase);
    rows = rows.filter((r) => names.has(r.ticker.toUpperCase()));
  }
  if (sector) {
    const want = sector.trim().toLowerCase();
    rows = rows.filter((r) => (r.sector ?? "").toLowerCase() === want);
  }
  return {
    as_of: payload.as_of ?? null,
    sector: sector ?? null,
    universe,
    count: rows.length,
    names: rows.map((r) => ({
      ticker: r.ticker, name: r.name ?? null, sector: r.sector ?? null, sub_industry: r.sub_industry ?? null,
      indices: r.indices ?? [], tier: r.tier ?? null,
      price: r.market?.price ?? null, chg_1d: r.market?.chg_1d ?? null, ret_1w: r.market?.ret_1w ?? null,
      ret_1m: r.market?.ret_1m ?? null, ret_ytd: r.market?.ret_ytd ?? null,
      verdict: (r.signals as { verdict?: unknown } | undefined)?.verdict ?? null,
    })),
  };
}

// ── Track record ───────────────────────────────────────────────────────

export async function readTrackRecord(userId: string, supabase: ServiceSupabase, strategy: "csp" | "covered_call") {
  const { data: trades, error } = await supabase.from("options_trades").select("*").eq("user_id", userId).order("expiry_date", { ascending: false });
  if (error) throw new Error(error.message);
  const settled = ((trades ?? []) as TradeInput[]).filter((t) => t.status !== "open");
  const tickers = [...new Set(settled.map((t) => t.ticker.toUpperCase()))].sort();
  const closedTickers = [...new Set(settled.filter((t) => t.status === "closed").map((t) => t.ticker.toUpperCase()))].sort();
  const [logs, hist, engine] = await Promise.all([
    pooledMap(tickers, 4, (t) => (market.strategyLog(t, 200) as Promise<{ rows?: LogRow[] }>).catch(() => null)),
    pooledMap(closedTickers, 4, (t) => (market.priceHistory(t, "2y", "1d") as Promise<HistoryResponse>).catch(() => null)),
    (market.scorecard(400) as Promise<Scorecard>).catch(() => null),
  ]);
  const byTicker: Record<string, LogRow[]> = {};
  tickers.forEach((t, i) => { byTicker[t] = logs[i]?.rows ?? []; });
  const closes: Record<string, number> = {};
  for (const t of settled) {
    if (t.status !== "closed") continue;
    const tk = t.ticker.toUpperCase();
    const rows = closesOf(hist[closedTickers.indexOf(tk)]);
    const date = t.expiry_date.slice(0, 10);
    const best = rows.filter((r) => r.time <= date).sort((a, b) => b.time.localeCompare(a.time))[0];
    if (best && (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${best.time}T00:00:00Z`)) / 86_400_000 <= 5) closes[`${tk}|${date}`] = best.close;
  }
  const graded = gradeTrades(settled, byTicker, closes);
  return {
    reading: composeTrackReading(graded, engine, strategy),
    strategy,
    summary: summarize(graded),
    cohorts: cohorts(graded),
    engine: engine?.by_strategy ?? null,
    trades: graded.map((g) => ({
      id: g.id, ticker: g.ticker, strategy: g.strategy, entry_date: g.entry_date, expiry_date: g.expiry_date, strike: g.strike_price,
      status: g.status, won: g.won, realized_pnl: g.realized_pnl, engine_strategy: g.engineStrategy, engine_strike: g.engineStrike,
      engine_pop: g.pop, agreement: g.agreement, hold_to_expiry_pnl: g.holdPnl, early_close_cost: g.earlyCloseCost, dte: g.dte,
    })),
    open_count: (trades ?? []).length - settled.length,
  };
}
