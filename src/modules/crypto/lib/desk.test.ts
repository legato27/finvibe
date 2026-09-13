// Run with:  node --test src/modules/crypto/lib/desk.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { equityPath, fmtMinutes, leanFromBias, liquidityRows, sessionLine, setupAsPriceAction, setupLabel } from "./desk.ts";

test("leanFromBias and setupLabel", () => {
  assert.equal(leanFromBias("bullish"), "on");
  assert.equal(leanFromBias("BEARISH"), "off");
  assert.equal(leanFromBias(null), "neutral");
  assert.equal(setupLabel("NO_CLEAR_SETUP"), "No clear setup");
  assert.equal(setupLabel("LIQUIDITY_SWEEP_REVERSAL"), "Liquidity sweep reversal");
  assert.equal(setupLabel(undefined), "no data");
});

test("sessionLine handles string and object sessions and the countdown", () => {
  assert.deepEqual(sessionLine({ active_session: "Asia", next_session: null }), { text: "Asia session open", active: true, minutes: null });
  assert.deepEqual(sessionLine({ active_session: "NY Open", next_session: null, all_sessions: [{ name: "Asia", active: false, minutes_left: null }, { name: "NY Open", active: true, minutes_left: 170 }] }), { text: "NY Open session open, 2 h 50 min left", active: true, minutes: 170 });
  assert.deepEqual(sessionLine({ active_session: { name: "London", ends_in_minutes: 95 }, next_session: null }), { text: "London session open, 1 h 35 min left", active: true, minutes: 95 });
  assert.deepEqual(sessionLine({ active_session: null, next_session: { name: "NY Open", starts_in_minutes: 60 } }), { text: "NY Open in 1 h", active: false, minutes: 60 });
  assert.equal(sessionLine(null).text, "Session clock unavailable");
  assert.equal(fmtMinutes(45), "45 min");
});

test("liquidityRows flattens pools, blocks and unfilled gaps nearest first", () => {
  const rows = liquidityRows({
    price_data: { current_price: 100 },
    liquidity_pools: [{ price: 120, type: "buy_side", strength: 2, touches: 3 }, { price: 98, type: "sell_side", strength: 1, touches: 2 }],
    order_blocks: [{ price_low: 90, price_high: 92, type: "bullish", strength: 3 }, { price_low: 70, price_high: 72, type: "bullish", strength: 1, mitigated: true }],
    fvgs: [{ lower: 103, upper: 105, type: "bullish" }, { lower: 50, upper: 52, type: "bearish", filled: true }],
  });
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.low}`), ["pool:98", "fvg:103", "order_block:90", "pool:120"]);
  assert.equal(rows[0].distance, 0.02);
  assert.equal(rows.find((r) => r.kind === "order_block")!.strength, 3);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.deepEqual(liquidityRows(null), []);
});

test("setupAsPriceAction maps the setup onto the chart's key levels", () => {
  const pa = setupAsPriceAction({ entry_zone: { low: 76994, high: 77770 }, stop_level: 75666, target_1: 78303, target_2: 80560, invalidation: 76046 })!;
  assert.deepEqual(pa.synthesis.key_levels.sweet_spot, { low: 76994, high: 77770 });
  assert.equal(pa.synthesis.key_levels.invalidation, 75666);
  assert.equal(pa.synthesis.key_levels.structural_target, 78303);
  assert.deepEqual(pa.synthesis.key_levels.support_resistance, { target_2: 80560, mm_invalidation: 76046 });
  assert.equal(setupAsPriceAction(null), undefined);
});

test("equityPath scales a curve into the box", () => {
  const p = equityPath([0, 1, -1], 100, 20);
  assert.ok(p.d.startsWith("M0.0,10.0 L50.0,0.0 L100.0,20.0"), p.d);
  assert.equal(equityPath([]).d, "");
});
