/**
 * Scalp-family composers: the desk reading, the packet summary, the Today
 * strip and the paper-vs-engine track record. `node --test src/lib/scalp.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeCryptoStrip, composeScalpDeskReading, summarizePacket, type ScalpDesk } from "./readings.ts";
import { aggregateScalps, composeScalpTrackReading, gradeScalpTrades, scalpCohorts, type EngineSignalRow, type ScalpTradeInput } from "./trackRecord.ts";

const row = (over: Partial<ScalpDesk["rows"][number]>): ScalpDesk["rows"][number] => ({
  symbol: "BTCUSDT", setup: "A", side: "long", status: "far", met: 2, total: 10,
  conditions: [{ name: "regime", ok: true, detail: "UC/RANGE" }, { name: "btc_trend", ok: true, detail: "UC" }, { name: "near_level", ok: false, detail: "40 bps from vwap_session" }],
  gates: { passed: true, failed: [] }, edge_bps: null, round_trip_bps: 7, confidence: null, levels: null, price: 76000, spread_bps: 0.01,
  regime: { pam_1h: "UC", pam_4h: "RANGE", btc_trend_1h: "UC" }, session: "asia", ts: 0, score: 0.2, ...over,
});
const desk = (rows: ScalpDesk["rows"], state: ScalpDesk["risk"]["state"] = "active"): ScalpDesk => ({
  as_of: "2026-09-17T01:00:00+00:00", symbols: 30, count: rows.length,
  tiers: { fired: rows.filter((r) => r.status === "fired").length, near: rows.filter((r) => r.status === "near").length, far: rows.filter((r) => r.status === "far").length },
  risk: { state, reason: state === "halted" ? "manual" : null, today: { trades_used: 2, trades_remaining: 10, realised_r: -0.5, daily_loss_used_r: 0.5, daily_loss_remaining_r: 2.5, consecutive_losses: 1, open_signals: 1 } },
  active_signals: [], rows,
});

test("desk reading names what fired, else the closest and what it waits on", () => {
  const fired = composeScalpDeskReading(desk([row({ status: "fired", met: 10, setup: "B", symbol: "ETHUSDT", side: "short" })]));
  assert.match(fired, /One setup fired this minute: ETHUSDT short flush fade/);
  assert.match(fired, /2 of 12 signals used, 2.5R of daily loss budget left, 1 open/);
  const near = composeScalpDeskReading(desk([row({ status: "near", met: 8 })]));
  assert.match(near, /Closest is BTCUSDT continuation at 8 of 10 conditions, waiting on near_level \(40 bps from vwap_session\)/);
  assert.match(composeScalpDeskReading(desk([row({})])), /nothing is close/);
  assert.match(composeScalpDeskReading(desk([row({})], "halted")), /^The scalp sleeve is halted \(manual\)/);
});

test("packet summary keeps the headline features and the sections", () => {
  const p = { symbol: "BTCUSDT", ts: 1, as_of: "x", price: 1, features: { cvd_session: 1, ofi_5lvl: 2, atr_5m: 3, imb_top1: 9, high_1m: 5 },
    time: { session: "us" }, regime: { pam_1h: "UC" }, levels: { vwap_session: 1 }, costs: { spread_bps: 0.01 }, data_quality: { gaps: {}, staleness_s: {} } };
  const s = summarizePacket(p);
  assert.deepEqual(Object.keys(s.features), ["cvd_session", "ofi_5lvl", "atr_5m"]);
  assert.equal(s.available, true);
  assert.equal(s.regime.pam_1h, "UC");
});

test("crypto strip reads the majors, funding, OI, bursts and the sleeve", () => {
  const t = composeCryptoStrip({
    as_of: "x", majors: [{ symbol: "BTCUSDT", price: 1, pam_1h: "UR", pam_4h: "RANGE" }, { symbol: "ETHUSDT", price: 1, pam_1h: "DC", pam_4h: "DC" }],
    funding_regime: "hot_long", oi_regime: "building", btc_trend_1h: "UR", liq_burst_minutes_24h: 400,
    active_signals: [{}], signals_today: 3, paper_realised_r_today: -0.75, risk: { state: "paused", reason: "daily loss" },
  });
  assert.equal(t.available, true);
  assert.match(t.reading, /^BTC at the range low on 1h, ranging on 4h and ETH trending down on 1h, trending down on 4h; funding crowded long, OI building; 400 liquidation-burst minutes/);
  assert.match(t.reading, /1 active signal, 3 today, paper -0.75R. The sleeve is paused.$/);
  assert.equal(composeCryptoStrip(null).available, false);
});

const trade = (over: Partial<ScalpTradeInput>): ScalpTradeInput => ({
  id: 1, ticker: "BTCUSDT", strategy: "scalp_A", mode: "paper", status: "closed", side: "long", entry_ts: "2026-09-17T00:00:00Z", exit_ts: "2026-09-17T00:20:00Z",
  entry_px: 100, exit_px: 101, size: 1, r_planned: 2, r_realised: 1, realized_pnl: 1, exit_reason: "manual", session: "asia", engine_signal_id: "s1",
  mae: 0.3, mfe: 1.4, slippage_modelled: 0.5, slippage_realised: 0.8, ...over,
});
const signals: EngineSignalRow[] = [{ signal_id: "s1", symbol: "BTCUSDT", setup: "A", side: "long", outcome: "target_hit", r_realised: 2, r_planned: 2, p_win_assumed: 0.45, time_stop_at: null, resolved_at: "x", session: "asia" }];

test("scalp trades grade beside the engine signal and count early closes", () => {
  const g = gradeScalpTrades([trade({}), trade({ id: 2, exit_reason: "stop", r_realised: -1, realized_pnl: -1, engine_signal_id: null }), trade({ id: 3, status: "open" })], signals);
  assert.equal(g.length, 2);
  assert.equal(g[0].earlyCloseCost, 1);              // the engine held to +2R, you took +1R: closing early cost 1R
  assert.equal(g[0].slippageGap, 0.3);
  assert.equal(g[1].earlyCloseCost, null);           // a stop is not an early close
  assert.equal(g[1].engine, null);
  const o = aggregateScalps(g);
  assert.equal(o.n, 2); assert.equal(o.win_rate, 0.5); assert.equal(o.avg_r, 0); assert.equal(o.realized, 0);
  assert.equal(o.mean_p_win, 0.45); assert.equal(o.calibration_gap, -0.05);
  const c = scalpCohorts(g);
  assert.deepEqual(Object.keys(c.byExitReason), ["manual", "stop"]);
  assert.equal(c.bySymbol.BTCUSDT.n, 2);
  const r = composeScalpTrackReading(g, { overall: { n: 10, win_rate: 0.6 } } as never, "scalp");
  assert.match(r, /2 settled scalp trades: win rate 50%, average 0.00R, \+0 realised/);
  assert.match(r, /Closing early cost 1.00R against holding to the time-stop over 1 trade/);
  assert.match(r, /engine's own signals: 60% over 10/);
  assert.match(composeScalpTrackReading([], null, "scalp_B"), /No settled scalp_B trades/);
});
