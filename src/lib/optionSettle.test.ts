// Run with:  node --test src/lib/optionSettle.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { settleOption, type SettleTrade } from "./optionSettle.ts";

const csp = (over: Partial<SettleTrade> = {}): SettleTrade => ({
  strategy: "cash_secured_put", strike_price: 110, premium: 2.6, contracts: 1, entry_date: "2026-10-09", ...over,
});

test("expired keeps the whole credit", () => {
  const s = settleOption(csp(), { status: "expired", close_date: "2026-10-30" });
  assert.equal(s.realized_pnl, 260);
  assert.equal(s.was_profitable, true);
});

test("closed keeps the credit less the buy-back", () => {
  const s = settleOption(csp(), { status: "closed", close_date: "2026-10-20", close_price: 0.6 });
  assert.equal(Math.round(s.realized_pnl), 200);
  assert.equal(s.close_price, 0.6);
});

test("an assigned put is marked at intrinsic on the assignment close (DOCN 2026-10-30)", () => {
  const s = settleOption(csp(), { status: "assigned", close_date: "2026-10-30", underlying_price_at_close: 89.65 });
  assert.equal(Math.round(s.realized_pnl), -1775);
  assert.equal(+s.close_price!.toFixed(2), 20.35);
  assert.equal(s.was_profitable, false);
  assert.ok(s.return_on_capital! < 0 && s.annualized_return! < 0);
});

test("an assigned put above its net basis is a small win", () => {
  const s = settleOption(csp(), { status: "assigned", close_date: "2026-10-30", underlying_price_at_close: 109 });
  assert.equal(Math.round(s.realized_pnl), 160);
  assert.equal(s.was_profitable, true);
});

test("an assigned put without the spot is refused", () => {
  assert.throws(() => settleOption(csp(), { status: "assigned", close_date: "2026-10-30" }), /underlying_price_at_close/);
});

test("an assigned covered call keeps the credit", () => {
  const s = settleOption(csp({ strategy: "covered_call" }), { status: "assigned", close_date: "2026-10-30", underlying_price_at_close: 130 });
  assert.equal(s.realized_pnl, 260);
  assert.equal(s.was_profitable, true);
});

test("return is on collateral, annualised over the days held", () => {
  const s = settleOption(csp({ strike_price: 30, premium: 0.35, entry_date: "2026-09-13" }), { status: "closed", close_date: "2026-10-07", close_price: 0.12 });
  assert.equal(+s.return_on_capital!.toFixed(4), 0.0077);
  assert.equal(+s.annualized_return!.toFixed(3), 0.117);
});
