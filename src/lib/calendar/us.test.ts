// Run with:  node --test src/lib/calendar/us.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  etOffset,
  eventInstant,
  horizon,
  mergeEvents,
  scheduledEvents,
  thirdFriday,
  weekOf,
  weekday,
} from "./us.ts";

test("thirdFriday matches known opex dates", () => {
  assert.equal(thirdFriday(2026, 9), "2026-09-18"); // September 2026 quad witching
  assert.equal(thirdFriday(2026, 3), "2026-03-20");
  assert.equal(thirdFriday(2026, 12), "2026-12-18");
  assert.equal(thirdFriday(2026, 5), "2026-05-15"); // May 1 2026 is a Friday
  assert.equal(weekday(thirdFriday(2027, 1)), 5);
});

test("weekOf gives Monday..Sunday, rolling forward on weekends", () => {
  assert.deepEqual(weekOf("2026-09-16"), { from: "2026-09-14", to: "2026-09-20" }); // Wednesday
  assert.deepEqual(weekOf("2026-09-14"), { from: "2026-09-14", to: "2026-09-20" }); // Monday
  assert.deepEqual(weekOf("2026-09-12"), { from: "2026-09-14", to: "2026-09-20" }); // Saturday → next week
  assert.deepEqual(weekOf("2026-09-13"), { from: "2026-09-14", to: "2026-09-20" }); // Sunday → next week
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("etOffset follows US daylight saving", () => {
  assert.equal(etOffset("2026-03-07"), "-05:00"); // day before DST starts (Mar 8 2026)
  assert.equal(etOffset("2026-03-08"), "-04:00");
  assert.equal(etOffset("2026-10-31"), "-04:00");
  assert.equal(etOffset("2026-11-01"), "-05:00"); // DST ends Nov 1 2026
  assert.equal(etOffset("2027-03-14"), "-04:00"); // DST starts Mar 14 2027
});

test("the FOMC week of 2026-09-14 lists the decision, CPI is absent, witching present", () => {
  const ev = scheduledEvents("2026-09-14", "2026-09-20");
  const kinds = ev.map((e) => `${e.date} ${e.kind}`);
  assert.ok(kinds.includes("2026-09-16 fomc"));
  assert.ok(kinds.includes("2026-09-18 witching"));
  assert.ok(!kinds.some((k) => k.endsWith("cpi")));
  const fomc = ev.find((e) => e.kind === "fomc")!;
  assert.equal(fomc.detail, "with projections");
  assert.equal(eventInstant(fomc)!.toISOString(), "2026-09-16T18:00:00.000Z"); // 14:00 EDT
});

test("events sort by date then weight, and the horizon is the shortest table", () => {
  const ev = scheduledEvents("2026-11-23", "2026-11-29");
  assert.deepEqual(ev.map((e) => `${e.date} ${e.kind}`), [
    "2026-11-25 pce",
    "2026-11-26 holiday",
    "2026-11-27 early_close",
  ]);
  assert.equal(horizon(), "2026-12-31");
  assert.equal(scheduledEvents("2028-01-01", "2028-01-31").filter((e) => e.kind !== "opex").length, 0);
  assert.equal(scheduledEvents("2028-01-01", "2028-01-31").length, 1); // opex still computed
});

test("mergeEvents collapses same-day name events and keeps order", () => {
  const merged = mergeEvents(scheduledEvents("2026-09-14", "2026-09-20"), [
    { date: "2026-09-16", kind: "earnings", tickers: ["NVDA"], weight: "medium" },
    { date: "2026-09-16", kind: "earnings", tickers: ["ADBE"], weight: "medium" },
    { date: "2026-09-15", kind: "ex_div", tickers: ["KO"], weight: "low" },
  ]);
  const row = merged.find((e) => e.kind === "earnings")!;
  assert.deepEqual(row.tickers, ["ADBE", "NVDA"]);
  assert.deepEqual(merged.map((e) => e.date), [...merged.map((e) => e.date)].sort());
  assert.equal(merged.filter((e) => e.kind === "earnings").length, 1);
  const sep16 = merged.filter((e) => e.date === "2026-09-16").map((e) => e.kind);
  assert.deepEqual(sep16, ["fomc", "earnings"]);
});
