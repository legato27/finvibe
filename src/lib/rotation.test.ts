// Run with:  node --test src/lib/rotation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { alignCloses, groupByQuadrant, quadrantOf, relativeRotation } from "./rotation.ts";

function dates(n: number) {
  const out: string[] = [];
  const d = new Date("2026-03-02T00:00:00Z");
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const DS = dates(130);
const bench = DS.map((time, i) => ({ time, close: 100 * Math.exp(0.0005 * i) }));

test("quadrantOf reads clockwise from top right", () => {
  assert.equal(quadrantOf({ x: 101, y: 101 }), "leading");
  assert.equal(quadrantOf({ x: 101, y: 99 }), "weakening");
  assert.equal(quadrantOf({ x: 99, y: 99 }), "lagging");
  assert.equal(quadrantOf({ x: 99, y: 101 }), "improving");
});

test("alignCloses keeps shared dates only, sorted, no duplicates", () => {
  const a = [{ time: "2026-01-05", close: 2 }, { time: "2026-01-02", close: 1 }, { time: "2026-01-02", close: 1 }, { time: "2026-01-06", close: 3 }];
  const b = [{ time: "2026-01-02", close: 10 }, { time: "2026-01-06", close: 30 }, { time: "2026-01-07", close: 40 }];
  assert.deepEqual(alignCloses(a, b).map((r) => r.time), ["2026-01-02", "2026-01-06"]);
});

test("a sector whose outperformance is still building is leading, with a five-point weekly trail", () => {
  // Accelerating: steady exponential outperformance would sit exactly on
  // momentum 100 (the ratio is constant), which is "holding", not leading.
  const etf = DS.map((time, i) => ({ time, close: 50 * Math.exp(0.0005 * i + 0.00002 * i * i) }));
  const r = relativeRotation(etf, bench)!;
  assert.ok(r);
  assert.equal(r.quadrant, "leading");
  assert.ok(r.current.x > 100 && r.current.y > 100);
  assert.equal(r.trail.length, 5);
  assert.equal(r.trail[4].time, DS[DS.length - 1]);
  assert.equal(r.trail[3].time, DS[DS.length - 6]);
});

test("a sector that stopped outperforming ten days ago is weakening", () => {
  // Ahead of the market over the window (ratio > 100) but flat lately, so the
  // three-month mean is catching up and the ratio is falling (momentum < 100).
  const etf = DS.map((time, i) => ({ time, close: 50 * Math.exp(0.0005 * i + 0.003 * Math.min(i, 120)) }));
  const r = relativeRotation(etf, bench)!;
  assert.equal(r.quadrant, "weakening");
});

test("a sector that has underperformed but is turning up is improving", () => {
  // Behind the market over the window (ratio < 100) but the last ten days
  // have turned up, so the ratio is rising (momentum > 100).
  const etf = DS.map((time, i) => ({ time, close: 50 * Math.exp(0.0005 * i - 0.002 * Math.min(i, 119) + (i > 119 ? 0.003 * (i - 119) : 0)) }));
  const r = relativeRotation(etf, bench)!;
  assert.equal(r.quadrant, "improving");
});

test("too little history yields null; a short trail is still a point", () => {
  const short = DS.slice(0, 60).map((time, i) => ({ time, close: 50 + i }));
  assert.equal(relativeRotation(short, bench), null);
  const barely = DS.slice(0, 75).map((time, i) => ({ time, close: 50 + i }));
  const r = relativeRotation(barely, bench)!;
  assert.ok(r);
  assert.ok(r.trail.length >= 1 && r.trail.length < 5);
});

test("groupByQuadrant buckets in order", () => {
  const g = groupByQuadrant([
    { id: 1, quadrant: "lagging" as const },
    { id: 2, quadrant: "leading" as const },
    { id: 3, quadrant: "leading" as const },
  ]);
  assert.deepEqual(g.leading.map((x) => x.id), [2, 3]);
  assert.deepEqual(g.lagging.map((x) => x.id), [1]);
  assert.deepEqual(g.improving, []);
});
