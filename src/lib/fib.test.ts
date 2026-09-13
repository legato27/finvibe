// Run with:  node --test src/lib/fib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fibFromPriceAction, fibLevels, fibRead, pickLeg, type SwingMarker } from "./fib.ts";

const markers: SwingMarker[] = [
  { date: "2026-05-01", type: "H", price: 150 },
  { date: "2026-05-20", type: "L", price: 120 },
  { date: "2026-06-10", type: "L", price: 118 }, // the lower low is the true origin
  { date: "2026-07-01", type: "H", price: 170 },
  { date: "2026-07-20", type: "L", price: 150 },
  { date: "2026-08-15", type: "H", price: 200 },
  { date: "2026-09-01", type: "L", price: 180 },
];

test("pickLeg finds the last completed up leg from the lowest low before the last high", () => {
  const leg = pickLeg(markers, "long")!;
  assert.ok(leg);
  assert.equal(leg.from.date, "2026-07-20");
  assert.equal(leg.from.price, 150);
  assert.equal(leg.to.date, "2026-08-15");
  assert.equal(leg.to.price, 200);
  assert.equal(leg.manual, false);
});

test("pickLeg finds the last completed down leg", () => {
  const leg = pickLeg(markers, "short")!;
  assert.equal(leg.from.date, "2026-08-15");
  assert.equal(leg.to.date, "2026-09-01");
  assert.equal(leg.to.price, 180);
});

test("pickLeg needs two markers and a real move", () => {
  assert.equal(pickLeg([], "long"), null);
  assert.equal(pickLeg([{ date: "2026-01-01", type: "L", price: 10 }], "long"), null);
  assert.equal(pickLeg([{ date: "2026-01-01", type: "L", price: 10 }, { date: "2026-01-05", type: "H", price: 9 }], "long"), null);
});

test("fibLevels: retracements back from the end, extensions beyond it, confluence tagged", () => {
  const leg = { direction: "long" as const, from: { date: "a", price: 100 }, to: { date: "b", price: 200 }, manual: false };
  const levels = fibLevels(leg, { sma50: 138.5, sweet_spot: 300 });
  const at = (r: number) => levels.find((l) => l.ratio === r)!;
  assert.equal(at(0.5).price, 150);
  assert.ok(Math.abs(at(0.618).price - 138.2) < 1e-9);
  assert.ok(Math.abs(at(0.65).price - 135) < 1e-9);
  assert.ok(Math.abs(at(1.618).price - 261.8) < 1e-9);
  assert.equal(at(1.272).kind, "extension");
  assert.deepEqual(at(0.618).confluence, ["sma50"]); // 138.2 vs 138.5 is within 0.6%
  assert.deepEqual(at(0.5).confluence, []);
  assert.ok(at(0.618).pocket && at(0.65).pocket && !at(0.5).pocket);
});

test("fibRead: zone, invalidation, targets and position for an up leg", () => {
  const leg = { direction: "long" as const, from: { date: "2026-07-20", price: 150 }, to: { date: "2026-08-15", price: 200 }, manual: false };
  const r = fibRead(leg, 172, { sma50: 168 });
  assert.ok(Math.abs(r.zone.low - 167.5) < 1e-9 && Math.abs(r.zone.high - 169.1) < 1e-9);
  assert.equal(r.invalidation, 150);
  assert.deepEqual(r.targets.map((x) => +x.toFixed(1)), [213.6, 230.9]);
  assert.equal(r.position, "above_zone");
  assert.ok(r.reading.startsWith("Pullback buy zone $167.50 to $169.10, the golden pocket of the Jul 20 to Aug 15 up leg, on the 50-day average."), r.reading);
  assert.ok(r.reading.includes("Invalid below $150.00. Targets $213.60 and $230.90."));
  assert.equal(fibRead(leg, 168, {}).position, "in_zone");
  assert.equal(fibRead(leg, 160, {}).position, "below_zone");
  assert.equal(fibRead(leg, 149, {}).position, "invalidated");
  assert.equal(fibRead(leg, 205, {}).position, "beyond_leg");
});

test("fibRead: a down leg mirrors the zone as a bounce sell zone", () => {
  const leg = { direction: "short" as const, from: { date: "2026-08-15", price: 200 }, to: { date: "2026-09-01", price: 180 }, manual: false };
  const r = fibRead(leg, 190, {});
  assert.ok(Math.abs(r.zone.low - 192.36) < 1e-9 && Math.abs(r.zone.high - 193) < 1e-9);
  assert.equal(r.invalidation, 200);
  assert.equal(r.position, "above_zone"); // has not bounced up to the zone yet
  assert.ok(r.reading.startsWith("Bounce sell zone $192.36 to $193.00"), r.reading);
  assert.ok(r.reading.includes("Invalid above $200.00"));
  assert.equal(fibRead(leg, 192.5, {}).position, "in_zone");
});

test("fibFromPriceAction picks the timeframe, honours a manual leg, and says when there is no leg", () => {
  const pa = {
    synthesis: { direction: "long", last_close: 190 },
    timeframes: {
      daily: { direction: "long", swing_markers: markers, last_close: 190, structure: { sma50: 168 } },
      weekly: { direction: "long", swing_markers: [], last_close: 190 },
    },
  };
  const daily = fibFromPriceAction(pa, "daily");
  assert.ok(daily.leg);
  if (daily.leg) assert.equal(daily.leg.to.price, 200);
  const weekly = fibFromPriceAction(pa, "weekly");
  assert.equal(weekly.leg, null);
  assert.ok(weekly.reading.includes("No completed up leg on the weekly chart"));
  const manual = fibFromPriceAction(pa, "daily", { direction: "long", from: { date: "2026-06-10", price: 118 }, to: { date: "2026-07-01", price: 170 }, manual: true });
  assert.ok(manual.leg && manual.leg.manual);
});
