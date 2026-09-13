// Run with:  node --test src/lib/trackRecord.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  classifyAgreement,
  cohorts,
  daysBetween,
  dteBand,
  gradeTrades,
  holdToExpiryPnl,
  matchLogRow,
  popFraction,
  summarize,
  type LogRow,
  type TradeInput,
} from "./trackRecord.ts";

const trade = (over: Partial<TradeInput> = {}): TradeInput => ({
  id: 1,
  ticker: "NVDA",
  strategy: "cash_secured_put",
  strike_price: 100,
  premium: 2,
  contracts: 1,
  expiry_date: "2026-08-21",
  entry_date: "2026-07-24",
  status: "expired",
  close_date: null,
  close_price: null,
  realized_pnl: 200,
  return_on_capital: 0.02,
  annualized_return: 0.26,
  was_profitable: true,
  ...over,
});

const row = (over: Partial<LogRow> = {}): LogRow => ({
  made_at: "2026-07-22T21:15:00+00:00",
  strategy: "sell_puts",
  put_strike: 100,
  call_strike: null,
  best_dte: 28,
  pop_pred: 0.78,
  conviction: 0.6,
  agreement: "agree",
  ...over,
});

test("daysBetween and dteBand", () => {
  assert.equal(daysBetween("2026-07-24", "2026-08-21"), 28);
  assert.equal(daysBetween("2026-07-22T21:15:00+00:00", "2026-07-24"), 2);
  assert.equal(dteBand(7), "≤14d");
  assert.equal(dteBand(28), "15–30d");
  assert.equal(dteBand(45), "31–45d");
  assert.equal(dteBand(60), ">45d");
});

test("popFraction accepts fractions and percents", () => {
  assert.equal(popFraction(0.78), 0.78);
  assert.equal(popFraction(78), 0.78);
  assert.equal(popFraction(null), null);
});

test("matchLogRow takes the latest row on or before entry within the window", () => {
  const rows = [
    row({ made_at: "2026-07-01T00:00:00Z", put_strike: 90 }),
    row({ made_at: "2026-07-22T21:15:00Z", put_strike: 100 }),
    row({ made_at: "2026-07-25T21:15:00Z", put_strike: 110 }), // after entry
    row({ made_at: "2026-07-24T10:00:00Z", put_strike: 105 }), // same day, allowed
  ];
  assert.equal(matchLogRow(trade(), rows)!.put_strike, 105);
  assert.equal(matchLogRow(trade(), rows.slice(0, 1)), null); // 23 days old
  assert.equal(matchLogRow(trade(), []), null);
});

test("classifyAgreement", () => {
  assert.equal(classifyAgreement(trade(), row()), "same");
  assert.equal(classifyAgreement(trade(), row({ put_strike: 101.5 })), "same"); // within 2%
  assert.equal(classifyAgreement(trade(), row({ put_strike: 95 })), "same_other_strike");
  assert.equal(classifyAgreement(trade(), row({ strategy: "sell_calls", call_strike: 120 })), "different");
  assert.equal(classifyAgreement(trade(), null), "none");
  assert.equal(classifyAgreement(trade({ strategy: "put_credit_spread" }), row()), "different");
  assert.equal(classifyAgreement(trade({ strategy: "covered_call", strike_price: 120 }), row({ strategy: "sell_calls", call_strike: 120 })), "same");
});

test("holdToExpiryPnl for puts, calls and spreads", () => {
  assert.equal(holdToExpiryPnl(trade(), 110), 200); // put expired worthless
  assert.equal(holdToExpiryPnl(trade(), 95), -300); // 5 in the money against 2 premium
  assert.equal(holdToExpiryPnl(trade({ strategy: "covered_call", strike_price: 100 }), 95), 200);
  assert.equal(holdToExpiryPnl(trade({ strategy: "covered_call", strike_price: 100, contracts: 2 }), 104), -400);
  assert.equal(holdToExpiryPnl(trade({ strategy: "put_credit_spread" }), 95), null);
});

test("gradeTrades joins the log, prices the counterfactual, skips open trades", () => {
  const trades: TradeInput[] = [
    trade({ id: 1 }),
    trade({ id: 2, ticker: "nvda", status: "closed", close_date: "2026-08-05", close_price: 0.5, realized_pnl: 150, was_profitable: true, entry_date: "2026-07-24" }),
    trade({ id: 3, ticker: "AMD", status: "assigned", realized_pnl: 200, was_profitable: null, strike_price: 150 }),
    trade({ id: 4, ticker: "KO", status: "open", realized_pnl: null }),
  ];
  const logs = { NVDA: [row()], AMD: [row({ put_strike: 140 })] };
  const g = gradeTrades(trades, logs, { "NVDA|2026-08-21": 110 });
  assert.equal(g.length, 3);
  const t2 = g.find((r) => r.id === 2)!;
  assert.equal(t2.ticker, "NVDA");
  assert.equal(t2.agreement, "same");
  assert.equal(t2.holdPnl, 200);
  assert.equal(t2.earlyCloseCost, 50); // holding would have made 50 more
  assert.equal(t2.pop, 0.78);
  assert.equal(t2.dte, 28);
  const t1 = g.find((r) => r.id === 1)!;
  assert.equal(t1.holdPnl, null); // not closed early
  assert.equal(t1.earlyCloseCost, null);
  const t3 = g.find((r) => r.id === 3)!;
  assert.equal(t3.agreement, "same_other_strike");
  assert.equal(t3.won, true); // realised > 0 when was_profitable is null
  assert.ok(Math.abs(t3.capturedPct! - 1) < 1e-12);
});

test("aggregate matches the scorecard's shape and measures calibration on priced trades only", () => {
  const g = gradeTrades(
    [
      trade({ id: 1, realized_pnl: 200, was_profitable: true }),
      trade({ id: 2, realized_pnl: -100, was_profitable: false, status: "assigned" }),
      trade({ id: 3, ticker: "XYZ", realized_pnl: 200, was_profitable: true }), // no engine view
    ],
    { NVDA: [row({ pop_pred: 0.8 })] },
    {},
  );
  const b = aggregate(g);
  assert.equal(b.n, 3);
  assert.ok(Math.abs(b.win_rate! - 2 / 3) < 1e-12);
  assert.ok(Math.abs(b.assignment_rate! - 1 / 3) < 1e-12);
  assert.ok(Math.abs(b.mean_pop_pred! - 0.8) < 1e-12);
  assert.ok(Math.abs(b.calibration_gap! - (0.8 - 0.5)) < 1e-12); // two priced trades, one won
  assert.ok(Math.abs(b.avg_captured_pct! - (1 - 0.5 + 1) / 3) < 1e-12);
  const empty = aggregate([]);
  assert.equal(empty.n, 0);
  assert.equal(empty.win_rate, null);
});

test("cohorts and summarize", () => {
  const g = gradeTrades(
    [
      trade({ id: 1 }),
      trade({ id: 2, strategy: "covered_call", strike_price: 120, realized_pnl: -50, was_profitable: false }),
      trade({ id: 3, status: "closed", realized_pnl: 100, was_profitable: true }),
    ],
    { NVDA: [row()] },
    { "NVDA|2026-08-21": 110 },
  );
  const c = cohorts(g);
  assert.equal(c.overall.n, 3);
  assert.equal(c.byStrategy.cash_secured_put.n, 2);
  assert.equal(c.byStrategy.covered_call.n, 1);
  assert.equal(c.byAgreement.same.n, 2);
  assert.equal(c.byAgreement.different.n, 1);
  assert.equal(c.byAgreement.none.n, 0);
  assert.equal(c.byDte["15–30d"].n, 3);
  const s = summarize(g);
  assert.equal(s.settled, 3);
  assert.equal(s.won, 2);
  assert.equal(s.earlyClosed, 1);
  assert.equal(s.earlyCloseCost, 100); // 200 held vs 100 realised
  assert.equal(s.realized, 250);
  assert.equal(s.matched, 2);
});
