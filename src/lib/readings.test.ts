// Run with:  node --test src/lib/readings.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annotateInflation,
  composeBookReading,
  composeSectorReading,
  composeTodayReading,
  composeTrackReading,
  composeWeekReading,
  type SectorRow,
} from "./readings.ts";
import { computeBookRisk } from "./bookRisk.ts";
import { gradeTrades } from "./trackRecord.ts";

test("composeTodayReading builds the strip's sentence", () => {
  const r = composeTodayReading(
    {
      today: { date: "2026-09-13", regime: "Strong Risk-On", regime_color: "green", risk_score: 41, signals: [{ signal: "Business cycle: Trough", weight: "medium" }, { signal: "VIX contango", weight: "high" }] },
      vix: { zone: "low" }, swarm: { signal_type: "caution" }, business_cycle: { state: "trough" },
    },
    { new_pam_triggers: [{ ticker: "CLS", setup: "UC1", direction: "long", conviction: 78 }, { ticker: "CPRT", setup: "DC1", direction: "short", conviction: 95 }], verdict_changes: [{ ticker: "ADBE", from: "stand_aside", to: "long", at: "" }], conflicts: [] },
  );
  assert.equal(r.available, true);
  if (!r.available) return;
  assert.ok(r.reading.startsWith("Lean in. Strong Risk-On at a risk score of +41."), r.reading);
  assert.ok(r.reading.includes("Macro watch: VIX contango."));
  assert.ok(r.reading.includes("Top signals: CPRT DC1 short (95), CLS UC1 long (78)."));
  assert.ok(r.reading.includes("3 signals fired today."));
  assert.equal(r.top_signals[0].ticker, "CPRT");
  assert.equal(r.fired_today, 3);
});

test("composeTodayReading says so when the feed is missing", () => {
  const r = composeTodayReading({}, null);
  assert.equal(r.available, false);
  assert.ok(r.reading.includes("no call today"));
});

const sectors: SectorRow[] = [
  { sector: "Energy", n: 24, market_cap: 2e12, chg_1d: 1.4, ret_1w: null, ret_1m: 3, ret_ytd: 10, advancers: 14, decliners: 10, n_long: 2, n_short: 1 },
  { sector: "Utilities", n: 35, market_cap: 1e12, chg_1d: -0.3, ret_1w: null, ret_1m: -1, ret_ytd: 5, advancers: 8, decliners: 27, n_long: 0, n_short: 3 },
  { sector: "Information Technology", n: 120, market_cap: 3e13, chg_1d: 1.2, ret_1w: null, ret_1m: 4, ret_ytd: 80, advancers: 96, decliners: 23, n_long: 20, n_short: 2 },
  { sector: "Unclassified", n: 3, market_cap: 1e9, chg_1d: 9, ret_1w: 9, ret_1m: 9, ret_ytd: 9, advancers: 3, decliners: 0, n_long: 0, n_short: 0 },
];

test("composeSectorReading names leader, laggard and count, ignoring Unclassified", () => {
  const r = composeSectorReading(sectors, "chg_1d");
  assert.equal(r.up, 2);
  assert.equal(r.total, 3);
  assert.equal(r.leader?.sector, "Energy");
  assert.equal(r.laggard?.sector, "Utilities");
  assert.ok(r.reading.startsWith("2 of 3 sectors up on the day. Energy led at +1.40%; Utilities lagged at -0.30%."), r.reading);
  assert.ok(r.market! > 1.1 && r.market! < 1.3);
});

test("composeSectorReading is honest about a window with no returns", () => {
  const r = composeSectorReading(sectors, "ret_1w");
  assert.equal(r.total, 0);
  assert.ok(r.reading.includes("has no returns yet"));
});

test("annotateInflation matches month and year, else falls back to the latest print", () => {
  const inflation = {
    rows: [
      { month: "2025-08-01", cpi_yoy: 2.8, cpi_core_yoy: 3.0, pce_yoy: 2.7, pce_core_yoy: 2.9 },
      { month: "2026-07-01", cpi_yoy: 3.3, cpi_core_yoy: 2.5, pce_yoy: 3.7, pce_core_yoy: 3.3 },
      { month: "2026-08-01", cpi_yoy: 3.4, cpi_core_yoy: 2.5, pce_yoy: null, pce_core_yoy: null },
    ],
    latest: {
      cpi: { month: "2026-08-01", cpi_yoy: 3.4, cpi_core_yoy: 2.5, pce_yoy: null, pce_core_yoy: null },
      pce: { month: "2026-07-01", cpi_yoy: 3.3, cpi_core_yoy: 2.5, pce_yoy: 3.7, pce_core_yoy: 3.3 },
    },
  };
  const cpi = annotateInflation({ date: "2026-09-11", kind: "cpi", detail: "August", weight: "high" }, inflation);
  assert.equal(cpi.note, "3.4% y/y · core 2.5%");
  const pce = annotateInflation({ date: "2026-09-30", kind: "pce", detail: "August", weight: "medium" }, inflation);
  assert.equal(pce.note, "last July: 3.7% y/y · core 3.3%"); // August 2025 must not match
  const dec = annotateInflation({ date: "2027-01-13", kind: "cpi", detail: "December", weight: "high" }, inflation);
  assert.equal(dec.note, "last August: 3.4% y/y · core 2.5%");
});

test("composeWeekReading", () => {
  const s = composeWeekReading(
    [
      { date: "2026-09-16", kind: "fomc", weight: "high" },
      { date: "2026-09-18", kind: "witching", weight: "high" },
      { date: "2026-09-17", kind: "earnings", tickers: ["NVDA", "ADBE"], weight: "high" },
    ],
    new Set(["NVDA"]),
    { hasNames: true, to: "2026-09-20", latestCpi: { month: "2026-08-01", cpi_yoy: 3.4, cpi_core_yoy: 2.5, pce_yoy: null, pce_core_yoy: null } },
  );
  assert.equal(
    s,
    "This week: Fed decision Wednesday and Quad witching Friday. 2 of your names report. 1 held name is inside an earnings window. Latest CPI 3.4% y/y, core 2.5%; the Fed targets 2%.",
  );
  assert.ok(composeWeekReading([], new Set(), { hasNames: false, to: "2026-09-20", latestCpi: null }).startsWith("A quiet week"));
});

test("composeBookReading", () => {
  const r = computeBookRisk({
    positions: [{ ticker: "AAA", value: 600 }, { ticker: "BBB", value: 400 }],
    returns: {},
  });
  const s = composeBookReading(r);
  assert.ok(s.includes("Your 2 names move independently"), s);
  assert.ok(s.includes("2 names have no usable history"), s);
});

test("composeTrackReading", () => {
  const trade = (id: number, over: Record<string, unknown> = {}) => ({
    id, ticker: "NVDA", strategy: "cash_secured_put" as const, strike_price: 100, premium: 2, contracts: 1,
    expiry_date: "2026-08-21", entry_date: "2026-07-24", status: "expired" as const, close_date: null, close_price: null,
    realized_pnl: 200, return_on_capital: 0.02, annualized_return: 0.26, was_profitable: true, ...over,
  });
  const g = gradeTrades([trade(1), trade(2), trade(3), trade(4), trade(5, { realized_pnl: -100, was_profitable: false })], {}, {});
  const s = composeTrackReading(g as never, { by_strategy: { sell_puts: { n: 260, win_rate: 0.74 } } }, "csp");
  assert.equal(s, "Your 5 settled trades: 4 won, 80%. The engine won 74% of the 260 short puts it recommended.");
  assert.ok(composeTrackReading([], null, "covered_call").startsWith("No settled trades yet"));
});
