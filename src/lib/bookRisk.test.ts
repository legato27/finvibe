/**
 * Run with:  node --test src/lib/bookRisk.test.ts
 * (Node strips the types itself; no test harness is installed.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beta,
  clusterByCorrelation,
  commonDates,
  computeBookRisk,
  correlationMatrix,
  effectiveBets,
  logReturns,
  pearson,
} from "./bookRisk.ts";

// ── Fixtures ───────────────────────────────────────────────────────────

/** Deterministic pseudo-random in [-1, 1). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

function dates(n: number, from = new Date("2026-03-02")): string[] {
  const out: string[] = [];
  const d = new Date(from);
  while (out.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** A return series driven by a shared factor plus own noise. */
function series(ds: string[], factor: number[], load: number, noise: number, seed: number) {
  const r = rng(seed);
  const m = new Map<string, number>();
  ds.forEach((d, i) => m.set(d, load * factor[i] + noise * r() * 0.01));
  return m;
}

const DS = dates(120);
const F1 = DS.map((_, i) => rng(1)() * 0.02 + (i % 2 ? 0.01 : -0.01));
const F2 = DS.map((_, i) => rng(2)() * 0.02 + (i % 3 ? -0.005 : 0.015));

// ── Primitives ─────────────────────────────────────────────────────────

test("logReturns sorts, dedupes and drops bad closes", () => {
  const r = logReturns([
    { time: "2026-01-03", close: 110 },
    { time: "2026-01-02", close: 100 },
    { time: "2026-01-02", close: 100 },
    { time: "2026-01-04", close: 0 },
    { time: "2026-01-05", close: 121 },
  ]);
  assert.deepEqual([...r.keys()], ["2026-01-03", "2026-01-05"]);
  assert.ok(Math.abs(r.get("2026-01-03")! - Math.log(1.1)) < 1e-12);
  assert.ok(Math.abs(r.get("2026-01-05")! - Math.log(1.1)) < 1e-12);
});

test("commonDates is the sorted intersection", () => {
  const a = new Map([["2026-01-02", 0], ["2026-01-03", 0], ["2026-01-06", 0]]);
  const b = new Map([["2026-01-06", 0], ["2026-01-03", 0], ["2026-01-07", 0]]);
  assert.deepEqual(commonDates([a, b]), ["2026-01-03", "2026-01-06"]);
  assert.deepEqual(commonDates([]), []);
});

test("pearson: identity, inverse, and constant series", () => {
  const a = [1, 2, 3, 4, 5];
  assert.ok(Math.abs(pearson(a, a) - 1) < 1e-12);
  assert.ok(Math.abs(pearson(a, a.map((x) => -x)) + 1) < 1e-12);
  assert.ok(Number.isNaN(pearson(a, [1, 1, 1, 1, 1])));
});

test("beta recovers a known slope", () => {
  const m = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02];
  const a = m.map((x) => 1.5 * x + 0.001);
  assert.ok(Math.abs(beta(a, m) - 1.5) < 1e-12);
});

test("correlationMatrix is symmetric with unit diagonal", () => {
  const m = correlationMatrix([[1, 2, 3, 4], [2, 4, 6, 9], [4, 3, 2, 1]]);
  assert.equal(m.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(m[i][i], 1);
    for (let j = 0; j < 3; j++) assert.equal(m[i][j], m[j][i]);
  }
  assert.ok(m[0][2] < -0.99);
});

test("effectiveBets: equal weights count every bet, one dominant reads near 1", () => {
  assert.ok(Math.abs(effectiveBets([1, 1, 1, 1]) - 4) < 1e-12);
  assert.ok(effectiveBets([0.97, 0.01, 0.01, 0.01]) < 1.1);
  assert.equal(effectiveBets([]), 0);
  assert.equal(effectiveBets([0, 0]), 0);
});

test("clusterByCorrelation groups the correlated pair and leaves the rest alone", () => {
  const corr = [
    [1, 0.9, 0.1, 0.0],
    [0.9, 1, 0.05, 0.1],
    [0.1, 0.05, 1, 0.2],
    [0.0, 0.1, 0.2, 1],
  ];
  assert.deepEqual(clusterByCorrelation(corr, 0.6), [[0, 1], [2], [3]]);
  assert.deepEqual(clusterByCorrelation(corr, 0.95), [[0], [1], [2], [3]]);
  assert.deepEqual(clusterByCorrelation([], 0.6), []);
});

// ── The whole answer ───────────────────────────────────────────────────

test("computeBookRisk finds two bets in four names driven by two factors", () => {
  const returns = {
    AAA: series(DS, F1, 1.0, 0.2, 11),
    BBB: series(DS, F1, 0.9, 0.2, 12),
    CCC: series(DS, F2, 1.0, 0.2, 13),
    DDD: series(DS, F2, 1.1, 0.2, 14),
  };
  const risk = computeBookRisk({
    positions: [
      { ticker: "AAA", value: 300 },
      { ticker: "bbb", value: 300 },
      { ticker: "CCC", value: 200 },
      { ticker: "DDD", value: 200 },
    ],
    returns,
  });
  assert.equal(risk.names, 4);
  assert.equal(risk.totalValue, 1000);
  assert.deepEqual(risk.included.slice().sort(), ["AAA", "BBB", "CCC", "DDD"]);
  assert.equal(risk.excluded.length, 0);
  assert.equal(risk.window.days, DS.length);
  assert.equal(risk.clusters.length, 2);
  assert.deepEqual(risk.clusters[0].members, ["AAA", "BBB"]);
  assert.ok(Math.abs(risk.clusters[0].weight - 0.6) < 1e-12);
  assert.ok(Math.abs(risk.effectiveBets - 1 / (0.36 + 0.16)) < 1e-12);
  assert.equal(risk.largest, risk.clusters[0]);
  assert.ok(risk.clusters[0].avgCorr! > 0.6);
  assert.equal(risk.bookBeta, null);
});

test("names without history stay in the book as their own bet", () => {
  const returns = {
    AAA: series(DS, F1, 1.0, 0.2, 21),
    BBB: series(DS, F1, 0.9, 0.2, 22),
  };
  const risk = computeBookRisk({
    positions: [
      { ticker: "AAA", value: 200 },
      { ticker: "BBB", value: 200 },
      { ticker: "NEW", value: 600 },
    ],
    returns,
  });
  assert.deepEqual(risk.excluded, [{ ticker: "NEW", reason: "no_history" }]);
  assert.equal(risk.clusters.length, 2);
  assert.deepEqual(risk.largest!.members, ["NEW"]);
  assert.ok(Math.abs(risk.largest!.weight - 0.6) < 1e-12);
  assert.ok(Math.abs(risk.effectiveBets - 1 / (0.36 + 0.16)) < 1e-12);
});

test("a short-history name is dropped from the correlation, not the book", () => {
  const short = new Map([...series(DS, F1, 1, 0.2, 31)].slice(-10));
  const risk = computeBookRisk({
    positions: [
      { ticker: "AAA", value: 100 },
      { ticker: "BBB", value: 100 },
      { ticker: "IPO", value: 100 },
    ],
    returns: {
      AAA: series(DS, F1, 1.0, 0.2, 32),
      BBB: series(DS, F1, 0.9, 0.2, 33),
      IPO: short,
    },
  });
  assert.deepEqual(risk.included.slice().sort(), ["AAA", "BBB"]);
  assert.deepEqual(risk.excluded, [{ ticker: "IPO", reason: "short_history" }]);
  assert.equal(risk.window.days, DS.length);
  assert.equal(risk.names, 3);
  assert.ok(Math.abs(risk.clusters.reduce((s, c) => s + c.weight, 0) - 1) < 1e-12);
});

test("one name, or too little shared history, yields no correlation and singleton bets", () => {
  const one = computeBookRisk({ positions: [{ ticker: "AAA", value: 1 }], returns: { AAA: series(DS, F1, 1, 0.2, 41) } });
  assert.deepEqual(one.included, []);
  assert.equal(one.clusters.length, 1);
  assert.equal(one.effectiveBets, 1);

  const tiny = computeBookRisk({
    positions: [{ ticker: "AAA", value: 1 }, { ticker: "BBB", value: 1 }],
    returns: {
      AAA: new Map([...series(DS, F1, 1, 0.2, 42)].slice(0, 10)),
      BBB: new Map([...series(DS, F1, 1, 0.2, 43)].slice(0, 10)),
    },
  });
  assert.deepEqual(tiny.included, []);
  assert.equal(tiny.excluded.length, 2);
  assert.equal(tiny.clusters.length, 2);
  assert.equal(tiny.window.days, 0);
});

test("betas and the factor tilt are value-weighted and report coverage", () => {
  const market = series(DS, F1, 1.0, 0.0, 51);
  const returns = {
    AAA: series(DS, F1, 1.5, 0.05, 52),
    BBB: series(DS, F1, 0.5, 0.05, 53),
  };
  const risk = computeBookRisk({
    positions: [{ ticker: "AAA", value: 750 }, { ticker: "BBB", value: 250 }],
    returns,
    market,
    factors: { AAA: { momentum: 2, value: -1 }, BBB: { momentum: 0, value: 1, moat: 3 } },
  });
  assert.ok(Math.abs(risk.betas.AAA - 1.5) < 0.1);
  assert.ok(Math.abs(risk.betas.BBB - 0.5) < 0.1);
  assert.ok(Math.abs(risk.bookBeta! - 1.25) < 0.1);
  const tilt = Object.fromEntries(risk.tilt.map((t) => [t.factor, t.value]));
  assert.ok(Math.abs(tilt.momentum - 1.5) < 1e-12);
  assert.ok(Math.abs(tilt.value - -0.5) < 1e-12);
  assert.ok(Math.abs(tilt.moat - 3) < 1e-12);
  assert.ok(Math.abs(risk.tiltCoverage - 1) < 1e-12);
});

test("tilt coverage names what the ranked book does not score", () => {
  const risk = computeBookRisk({
    positions: [{ ticker: "AAA", value: 300 }, { ticker: "ZZZ", value: 700 }],
    returns: {},
    factors: { AAA: { momentum: 1 } },
  });
  assert.ok(Math.abs(risk.tiltCoverage - 0.3) < 1e-12);
  assert.equal(risk.excluded.length, 2);
});
