/**
 * Track record — the reader's own option trades graded beside the engine.
 *
 * The journal stores what the reader did (strategy, strike, premium, entry,
 * expiry, outcome). It never stored what the engine thought that day, but
 * the box's per-ticker strategy log did: a timestamped row with the
 * engine's strategy, strikes, days to expiry and predicted probability of
 * profit. For each trade the log row made closest before the entry date,
 * within `MATCH_DAYS`, is "what the engine said". From there:
 *
 *   - agreement:   same strategy and strike / same strategy, other strike /
 *                  engine said something else / no engine view that day
 *   - counterfactual: for a trade closed early, what holding to expiry
 *                  would have paid, from the underlying's close on expiry
 *   - cohorts:     the scorecard's own Block shape (win rate, captured
 *                  premium, annualised, assignment rate, predicted
 *                  probability, calibration gap) so the reader's numbers
 *                  sit beside the engine's in the same units
 *
 * Pure module: no fetching, no React, so `node --test` runs it directly.
 */

export type JournalStrategy = "cash_secured_put" | "covered_call" | "put_credit_spread" | "call_credit_spread";
export type JournalStatus = "open" | "closed" | "expired" | "assigned";

export type TradeInput = {
  id: number;
  ticker: string;
  strategy: JournalStrategy;
  strike_price: number;
  premium: number;
  contracts: number;
  expiry_date: string;
  entry_date: string;
  status: JournalStatus;
  close_date: string | null;
  close_price: number | null;
  realized_pnl: number | null;
  return_on_capital: number | null;
  annualized_return: number | null;
  was_profitable: boolean | null;
};

export type LogRow = {
  made_at: string | null;
  strategy: string | null;
  put_strike: number | null;
  call_strike: number | null;
  best_dte: number | null;
  pop_pred: number | null;
  conviction: number | null;
  agreement: string | null;
};

export type Agreement = "same" | "same_other_strike" | "different" | "none";
export type EngineStrategy = "sell_puts" | "sell_calls";

export const MATCH_DAYS = 14;
/** A strike within this fraction of the engine's counts as the same strike. */
export const STRIKE_TOLERANCE = 0.02;

export function engineStrategyFor(s: JournalStrategy): EngineStrategy | null {
  return s === "cash_secured_put" ? "sell_puts" : s === "covered_call" ? "sell_calls" : null;
}

const DAY = 86_400_000;
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY);
}

/** Probability of profit as a fraction, whichever unit the log used. */
export function popFraction(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v > 1 ? v / 100 : v;
}

/** The engine's view at entry: the latest log row on or before the entry
 *  date, no older than `maxDays`. Rows made after entry are not the view
 *  the reader could have acted on. */
export function matchLogRow(trade: Pick<TradeInput, "entry_date">, rows: LogRow[], maxDays = MATCH_DAYS): LogRow | null {
  let best: LogRow | null = null;
  let bestAge = Infinity;
  for (const r of rows) {
    if (!r.made_at) continue;
    const age = daysBetween(r.made_at, trade.entry_date);
    if (age < 0 || age > maxDays) continue;
    if (age < bestAge) { best = r; bestAge = age; }
  }
  return best;
}

export function asEngineStrategy(s: string | null | undefined): EngineStrategy | null {
  return s === "sell_puts" || s === "sell_calls" ? s : null;
}

export function engineStrike(row: LogRow, strategy: EngineStrategy): number | null {
  return strategy === "sell_puts" ? row.put_strike : row.call_strike;
}

export function classifyAgreement(trade: TradeInput, row: LogRow | null): Agreement {
  if (!row) return "none";
  const mine = engineStrategyFor(trade.strategy);
  if (!mine || row.strategy !== mine) return "different";
  const k = engineStrike(row, mine);
  if (k == null || k <= 0) return "same_other_strike";
  return Math.abs(k - trade.strike_price) / trade.strike_price <= STRIKE_TOLERANCE ? "same" : "same_other_strike";
}

/** Dollars the position would have made held to expiry, given the
 *  underlying's close on expiry. Commissions and, for a covered call, the
 *  stock leg are left out. Null for the spread strategies. */
export function holdToExpiryPnl(trade: TradeInput, spotAtExpiry: number): number | null {
  const size = 100 * trade.contracts;
  if (trade.strategy === "cash_secured_put") return (trade.premium - Math.max(0, trade.strike_price - spotAtExpiry)) * size;
  if (trade.strategy === "covered_call") return (trade.premium - Math.max(0, spotAtExpiry - trade.strike_price)) * size;
  return null;
}

export type GradedTrade = TradeInput & {
  engine: LogRow | null;
  agreement: Agreement;
  engineStrategy: EngineStrategy | null;
  engineStrike: number | null;
  pop: number | null;
  won: boolean;
  /** Fraction of the credit kept: realised P&L over premium received. */
  capturedPct: number | null;
  dte: number;
  dteBand: string;
  holdPnl: number | null;
  /** holdPnl − realised, for a trade closed early. Positive = closing cost money. */
  earlyCloseCost: number | null;
};

export function dteBand(dte: number): string {
  if (dte <= 14) return "≤14d";
  if (dte <= 30) return "15–30d";
  if (dte <= 45) return "31–45d";
  return ">45d";
}

export function gradeTrades(
  trades: TradeInput[],
  logs: Record<string, LogRow[]>,
  /** Underlying close on expiry, keyed `${ticker}|${expiry_date}`. */
  expiryCloses: Record<string, number>,
): GradedTrade[] {
  return trades
    .filter((t) => t.status !== "open")
    .map((t) => {
      const ticker = t.ticker.toUpperCase();
      const engine = matchLogRow(t, logs[ticker] ?? []);
      const agreement = classifyAgreement(t, engine);
      const es = engineStrategyFor(t.strategy);
      const credit = t.premium * 100 * t.contracts;
      const won = t.was_profitable ?? (t.realized_pnl != null ? t.realized_pnl > 0 : false);
      const spot = expiryCloses[`${ticker}|${t.expiry_date.slice(0, 10)}`];
      const holdPnl = t.status === "closed" && spot != null ? holdToExpiryPnl(t, spot) : null;
      return {
        ...t,
        ticker,
        engine,
        agreement,
        engineStrategy: asEngineStrategy(engine?.strategy),
        engineStrike: engine && es ? engineStrike(engine, es) : null,
        pop: engine && agreement !== "different" ? popFraction(engine.pop_pred) : null,
        won,
        capturedPct: credit > 0 && t.realized_pnl != null ? t.realized_pnl / credit : null,
        dte: daysBetween(t.entry_date, t.expiry_date),
        dteBand: dteBand(daysBetween(t.entry_date, t.expiry_date)),
        holdPnl,
        earlyCloseCost: holdPnl != null && t.realized_pnl != null ? holdPnl - t.realized_pnl : null,
      };
    })
    .sort((a, b) => b.expiry_date.localeCompare(a.expiry_date));
}

/** The scorecard's Block: same fields, same units (fractions). */
export type Block = {
  n: number;
  win_rate: number | null;
  avg_captured_pct: number | null;
  avg_annualized_pct: number | null;
  assignment_rate: number | null;
  mean_pop_pred: number | null;
  calibration_gap: number | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function aggregate(rows: GradedTrade[]): Block {
  const n = rows.length;
  if (!n) return { n: 0, win_rate: null, avg_captured_pct: null, avg_annualized_pct: null, assignment_rate: null, mean_pop_pred: null, calibration_gap: null };
  const win_rate = rows.filter((r) => r.won).length / n;
  const pops = rows.map((r) => r.pop).filter((p): p is number => p != null);
  const mean_pop_pred = mean(pops);
  return {
    n,
    win_rate,
    avg_captured_pct: mean(rows.map((r) => r.capturedPct).filter((x): x is number => x != null)),
    avg_annualized_pct: mean(rows.map((r) => r.annualized_return).filter((x): x is number => x != null)),
    assignment_rate: rows.filter((r) => r.status === "assigned").length / n,
    mean_pop_pred,
    // Calibration is measured on the trades the engine actually priced.
    calibration_gap: mean_pop_pred != null && pops.length ? mean_pop_pred - rows.filter((r) => r.pop != null && r.won).length / pops.length : null,
  };
}

export type Cohorts = {
  overall: Block;
  byStrategy: Record<string, Block>;
  byAgreement: Record<Agreement, Block>;
  byDte: Record<string, Block>;
};

export function cohorts(rows: GradedTrade[]): Cohorts {
  const by = <K extends string>(key: (r: GradedTrade) => K, keys?: K[]): Record<K, Block> => {
    const groups = new Map<K, GradedTrade[]>();
    for (const k of keys ?? []) groups.set(k, []);
    for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    return Object.fromEntries([...groups].map(([k, v]) => [k, aggregate(v)])) as Record<K, Block>;
  };
  return {
    overall: aggregate(rows),
    byStrategy: by((r) => r.strategy),
    byAgreement: by((r) => r.agreement, ["same", "same_other_strike", "different", "none"]),
    byDte: by((r) => r.dteBand, ["≤14d", "15–30d", "31–45d", ">45d"]),
  };
}

export type Summary = {
  settled: number;
  won: number;
  winRate: number | null;
  matched: number;
  meanPop: number | null;
  calibrationGap: number | null;
  earlyClosed: number;
  /** Sum over early-closed trades with a counterfactual; positive = closing cost money. */
  earlyCloseCost: number | null;
  realized: number;
};

export function summarize(rows: GradedTrade[]): Summary {
  const o = aggregate(rows);
  const priced = rows.filter((r) => r.pop != null);
  const early = rows.filter((r) => r.earlyCloseCost != null);
  return {
    settled: rows.length,
    won: rows.filter((r) => r.won).length,
    winRate: o.win_rate,
    matched: priced.length,
    meanPop: o.mean_pop_pred,
    calibrationGap: o.calibration_gap,
    earlyClosed: rows.filter((r) => r.status === "closed").length,
    earlyCloseCost: early.length ? early.reduce((s, r) => s + (r.earlyCloseCost ?? 0), 0) : null,
    realized: rows.reduce((s, r) => s + (r.realized_pnl ?? 0), 0),
  };
}


// ── Crypto scalp trades vs the engine's signals ───────────────────────
// A paper scalp trade is graded beside the engine signal it followed
// (engine_signal_id → the recommendation-log row): your realised R against
// the engine's R at time-stop, and what closing early saved or cost.

export type ScalpTradeInput = {
  id: number; ticker: string; strategy: string; mode: string; status: string; side: string | null;
  entry_ts: string | null; exit_ts: string | null; entry_px: number | null; exit_px: number | null; size: number | null;
  r_planned: number | null; r_realised: number | null; realized_pnl: number | null; exit_reason: string | null;
  session: string | null; engine_signal_id: string | null; mae: number | null; mfe: number | null;
  slippage_modelled: number | null; slippage_realised: number | null;
};
export type EngineSignalRow = {
  signal_id: string; symbol: string; setup: string; side: string; outcome: string | null; r_realised: number | null;
  r_planned: number | null; p_win_assumed: number | null; time_stop_at: string | null; resolved_at: string | null; session: string | null;
};
export type GradedScalp = ScalpTradeInput & {
  won: boolean; engine: EngineSignalRow | null; engineR: number | null;
  /** engine R at time-stop minus your R: positive = closing early cost you, negative = it saved you. */
  earlyCloseCost: number | null; pWin: number | null; slippageGap: number | null;
};

export function gradeScalpTrades(trades: ScalpTradeInput[], signals: EngineSignalRow[]): GradedScalp[] {
  const byId = new Map(signals.map((s) => [s.signal_id, s]));
  return trades.filter((t) => t.status !== "open").map((t) => {
    const eng = t.engine_signal_id ? byId.get(t.engine_signal_id) ?? null : null;
    const engineR = eng?.r_realised ?? null;
    const mine = t.r_realised;
    const early = t.exit_reason != null && t.exit_reason !== "time_stop" && t.exit_reason !== "target" && t.exit_reason !== "stop";
    return {
      ...t,
      won: (t.realized_pnl ?? 0) > 0,
      engine: eng, engineR,
      earlyCloseCost: early && engineR != null && mine != null ? +(engineR - mine).toFixed(3) : null,
      pWin: eng?.p_win_assumed ?? null,
      slippageGap: t.slippage_realised != null && t.slippage_modelled != null ? +(t.slippage_realised - t.slippage_modelled).toFixed(3) : null,
    };
  });
}

export type ScalpBlock = {
  n: number; win_rate: number | null; avg_r: number | null; median_r: number | null; realized: number;
  mean_p_win: number | null; calibration_gap: number | null; avg_mae: number | null; avg_mfe: number | null; avg_slippage_gap: number | null;
};

export function aggregateScalps(rows: GradedScalp[]): ScalpBlock {
  const n = rows.length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const rs = rows.map((r) => r.r_realised).filter((x): x is number => x != null).sort((a, b) => a - b);
  const p = rows.map((r) => r.pWin).filter((x): x is number => x != null);
  const winRate = n ? rows.filter((r) => r.won).length / n : null;
  const meanP = mean(p);
  return {
    n, win_rate: winRate == null ? null : +winRate.toFixed(3),
    avg_r: rs.length ? +(mean(rs) as number).toFixed(3) : null,
    median_r: rs.length ? +(rs.length % 2 ? rs[(rs.length - 1) / 2] : (rs[rs.length / 2 - 1] + rs[rs.length / 2]) / 2).toFixed(3) : null,
    realized: +rows.reduce((s, r) => s + (r.realized_pnl ?? 0), 0).toFixed(2),
    mean_p_win: meanP == null ? null : +meanP.toFixed(3),
    calibration_gap: meanP != null && winRate != null ? +(meanP - winRate).toFixed(3) : null,
    avg_mae: mean(rows.map((r) => r.mae).filter((x): x is number => x != null)),
    avg_mfe: mean(rows.map((r) => r.mfe).filter((x): x is number => x != null)),
    avg_slippage_gap: mean(rows.map((r) => r.slippageGap).filter((x): x is number => x != null)),
  };
}

export function scalpCohorts(rows: GradedScalp[]) {
  const by = (key: (r: GradedScalp) => string) => {
    const groups: Record<string, GradedScalp[]> = {};
    for (const r of rows) (groups[key(r)] ??= []).push(r);
    return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, aggregateScalps(v)]));
  };
  return {
    overall: aggregateScalps(rows),
    byStrategy: by((r) => r.strategy),
    bySession: by((r) => r.session ?? "n/a"),
    bySymbol: by((r) => r.ticker),
    byExitReason: by((r) => r.exit_reason ?? "n/a"),
  };
}

export function composeScalpTrackReading(rows: GradedScalp[], engine: Record<string, ScalpBlock | Record<string, unknown>> | null, strategy: string): string {
  const o = aggregateScalps(rows);
  if (!o.n) return `No settled ${strategy === "scalp" ? "scalp" : strategy} trades in the paper journal yet.`;
  const early = rows.filter((r) => r.earlyCloseCost != null);
  const cost = early.length ? early.reduce((s, r) => s + (r.earlyCloseCost ?? 0), 0) : null;
  const parts = [`${o.n} settled ${strategy === "scalp" ? "scalp" : strategy} trades: win rate ${((o.win_rate ?? 0) * 100).toFixed(0)}%, average ${(o.avg_r ?? 0).toFixed(2)}R, ${o.realized >= 0 ? "+" : ""}${o.realized.toFixed(0)} realised.`];
  if (o.calibration_gap != null) parts.push(`The gate assumed ${((o.mean_p_win ?? 0) * 100).toFixed(0)}% wins; the gap is ${o.calibration_gap >= 0 ? "+" : ""}${(o.calibration_gap * 100).toFixed(0)} points${o.calibration_gap > 0.05 ? " (over-confident)" : o.calibration_gap < -0.05 ? " (under-confident)" : ""}.`);
  if (cost != null) parts.push(`Closing early ${cost > 0 ? "cost" : "saved"} ${Math.abs(cost).toFixed(2)}R against holding to the time-stop over ${early.length} trade${early.length === 1 ? "" : "s"}.`);
  const engOverall = engine && (engine.overall as ScalpBlock | undefined);
  if (engOverall && engOverall.n) parts.push(`The engine's own signals: ${((engOverall.win_rate ?? 0) * 100).toFixed(0)}% over ${engOverall.n}.`);
  return parts.join(" ");
}
