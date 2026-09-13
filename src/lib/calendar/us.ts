/**
 * The US market calendar the Today page reads from — scheduled, public,
 * market-moving events, kept as data in the repo because no feed on the box
 * carries them (no economic-calendar vendor; FMP is dead; FRED has series,
 * not events). Dates only: consensus and actual figures need a paid feed.
 *
 * Sources, checked 2026-09-13:
 *   FOMC      federalreserve.gov/monetarypolicy/fomccalendars.htm (2026, 2027)
 *   CPI       bls.gov/schedule/news_release/cpi.htm            (2026)
 *   Jobs      bls.gov/schedule/news_release/empsit.htm         (2026)
 *   PCE       bea.gov/news/schedule                             (2026)
 *   Holidays  nyse.com/markets/hours-calendars                  (2026, 2027)
 * Opex and witching are computed (third Friday), so they never run out.
 *
 * `horizon()` is the last date every scheduled kind is known through; the
 * panel says so when a requested window runs past it rather than showing a
 * quiet week that is really an empty table. Extend the tables when the
 * agencies publish the next year, usually in the autumn.
 *
 * Pure module: no fetching, no React, so `node --test` runs it directly.
 */

export type CalKind =
  | "fomc"
  | "cpi"
  | "pce"
  | "jobs"
  | "opex"
  | "witching"
  | "holiday"
  | "early_close"
  | "earnings"
  | "ex_div";

export type CalEvent = {
  /** YYYY-MM-DD, US Eastern calendar date. */
  date: string;
  kind: CalKind;
  /** HH:MM in US Eastern time, when the event has a time. */
  timeEt?: string;
  /** Extra words for the row: "with projections", "January CPI", a holiday name. */
  detail?: string;
  /** Names this event belongs to (earnings, ex-div). */
  tickers?: string[];
  /** A figure attached at render time, e.g. the latest CPI print. */
  note?: string;
  /** high = moves the whole tape; medium = worth a glance; low = housekeeping. */
  weight: "high" | "medium" | "low";
};

// ── Scheduled tables ──────────────────────────────────────────────────

/** Decision day (second day) of each meeting; `sep` marks a projections meeting. */
const FOMC: Array<{ date: string; sep: boolean }> = [
  { date: "2026-01-28", sep: false },
  { date: "2026-03-18", sep: true },
  { date: "2026-04-29", sep: false },
  { date: "2026-06-17", sep: true },
  { date: "2026-07-29", sep: false },
  { date: "2026-09-16", sep: true },
  { date: "2026-10-28", sep: false },
  { date: "2026-12-09", sep: true },
  { date: "2027-01-27", sep: false },
  { date: "2027-03-17", sep: true },
  { date: "2027-04-28", sep: false },
  { date: "2027-06-09", sep: true },
  { date: "2027-07-28", sep: false },
  { date: "2027-09-15", sep: true },
  { date: "2027-10-27", sep: false },
  { date: "2027-12-08", sep: true },
];

/** Release date → reference month. */
const CPI: Array<[string, string]> = [
  ["2026-01-13", "December"], ["2026-02-13", "January"], ["2026-03-11", "February"],
  ["2026-04-10", "March"], ["2026-05-12", "April"], ["2026-06-10", "May"],
  ["2026-07-14", "June"], ["2026-08-12", "July"], ["2026-09-11", "August"],
  ["2026-10-14", "September"], ["2026-11-10", "October"], ["2026-12-10", "November"],
];

const JOBS: Array<[string, string]> = [
  ["2026-01-09", "December"], ["2026-02-11", "January"], ["2026-03-06", "February"],
  ["2026-04-03", "March"], ["2026-05-08", "April"], ["2026-06-05", "May"],
  ["2026-07-02", "June"], ["2026-08-07", "July"], ["2026-09-04", "August"],
  ["2026-10-02", "September"], ["2026-11-06", "October"], ["2026-12-04", "November"],
];

/** Personal Income and Outlays, which carries the PCE price index. */
const PCE: Array<[string, string]> = [
  ["2026-09-30", "August"], ["2026-10-29", "September"], ["2026-11-25", "October"], ["2026-12-23", "November"],
];

const HOLIDAYS: Array<[string, string]> = [
  ["2026-01-01", "New Year's Day"], ["2026-01-19", "Martin Luther King Jr. Day"],
  ["2026-02-16", "Washington's Birthday"], ["2026-04-03", "Good Friday"],
  ["2026-05-25", "Memorial Day"], ["2026-06-19", "Juneteenth"],
  ["2026-07-03", "Independence Day (observed)"], ["2026-09-07", "Labor Day"],
  ["2026-11-26", "Thanksgiving Day"], ["2026-12-25", "Christmas Day"],
  ["2027-01-01", "New Year's Day"], ["2027-01-18", "Martin Luther King Jr. Day"],
  ["2027-02-15", "Washington's Birthday"], ["2027-03-26", "Good Friday"],
  ["2027-05-31", "Memorial Day"], ["2027-06-18", "Juneteenth (observed)"],
  ["2027-07-05", "Independence Day (observed)"], ["2027-09-06", "Labor Day"],
  ["2027-11-25", "Thanksgiving Day"], ["2027-12-24", "Christmas Day (observed)"],
];

const EARLY_CLOSES: Array<[string, string]> = [
  ["2026-11-27", "day after Thanksgiving"], ["2026-12-24", "Christmas Eve"],
  ["2027-11-26", "day after Thanksgiving"],
];

/** Last date each scheduled kind is known through. */
const KNOWN_THROUGH: Record<Exclude<CalKind, "opex" | "witching" | "earnings" | "ex_div">, string> = {
  fomc: "2027-12-31",
  cpi: "2026-12-31",
  jobs: "2026-12-31",
  pce: "2026-12-31",
  holiday: "2027-12-31",
  early_close: "2027-12-31",
};

/** The earliest of the known-through dates: past it the calendar is incomplete. */
export function horizon(): string {
  return Object.values(KNOWN_THROUGH).sort()[0];
}

// ── Date helpers (all on YYYY-MM-DD strings, no time zones) ──────────

export function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function fromIso(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
export function addDays(s: string, n: number): string {
  const d = fromIso(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}
/** 0 = Sunday … 6 = Saturday. */
export function weekday(s: string): number {
  return fromIso(s).getUTCDay();
}

/** Third Friday of a month, YYYY-MM-DD. `month` is 1..12. */
export function thirdFriday(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offsetToFriday = (5 - first.getUTCDay() + 7) % 7;
  return toIso(new Date(Date.UTC(year, month - 1, 1 + offsetToFriday + 14)));
}

/**
 * The trading week to show: Monday to Sunday containing `today`, or the
 * next week when today is Saturday or Sunday, since a weekend reader wants
 * the week ahead, not the one that just closed.
 */
export function weekOf(today: string): { from: string; to: string } {
  const wd = weekday(today);
  const monday = wd === 0 ? addDays(today, 1) : wd === 6 ? addDays(today, 2) : addDays(today, 1 - wd);
  return { from: monday, to: addDays(monday, 6) };
}

/** US Eastern UTC offset for a calendar date: DST from the second Sunday of
 *  March to the first Sunday of November. */
export function etOffset(date: string): "-04:00" | "-05:00" {
  const y = Number(date.slice(0, 4));
  const march1 = weekday(`${y}-03-01`);
  const dstStart = `${y}-03-${String(1 + ((7 - march1) % 7) + 7).padStart(2, "0")}`;
  const nov1 = weekday(`${y}-11-01`);
  const dstEnd = `${y}-11-${String(1 + ((7 - nov1) % 7)).padStart(2, "0")}`;
  return date >= dstStart && date < dstEnd ? "-04:00" : "-05:00";
}

/** Absolute instant of an event with a time, for local-zone display. */
export function eventInstant(e: CalEvent): Date | null {
  if (!e.timeEt) return null;
  return new Date(`${e.date}T${e.timeEt}:00${etOffset(e.date)}`);
}

// ── The schedule ──────────────────────────────────────────────────────

/** Every scheduled and computed event with `from <= date <= to`, sorted. */
export function scheduledEvents(from: string, to: string): CalEvent[] {
  const out: CalEvent[] = [];
  const within = (d: string) => d >= from && d <= to;

  for (const m of FOMC) if (within(m.date)) out.push({ date: m.date, kind: "fomc", timeEt: "14:00", detail: m.sep ? "with projections" : undefined, weight: "high" });
  for (const [d, ref] of CPI) if (within(d)) out.push({ date: d, kind: "cpi", timeEt: "08:30", detail: ref, weight: "high" });
  for (const [d, ref] of JOBS) if (within(d)) out.push({ date: d, kind: "jobs", timeEt: "08:30", detail: ref, weight: "high" });
  for (const [d, ref] of PCE) if (within(d)) out.push({ date: d, kind: "pce", timeEt: "08:30", detail: ref, weight: "medium" });
  for (const [d, name] of HOLIDAYS) if (within(d)) out.push({ date: d, kind: "holiday", detail: name, weight: "medium" });
  for (const [d, name] of EARLY_CLOSES) if (within(d)) out.push({ date: d, kind: "early_close", timeEt: "13:00", detail: name, weight: "low" });

  // Opex every month, quad witching in March, June, September, December.
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    for (let m = 1; m <= 12; m++) {
      const d = thirdFriday(y, m);
      if (!within(d)) continue;
      const witching = m % 3 === 0;
      out.push({ date: d, kind: witching ? "witching" : "opex", timeEt: "16:00", weight: witching ? "high" : "low" });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.timeEt ?? "99").localeCompare(b.timeEt ?? "99") || rank(a) - rank(b));
}

function rank(e: CalEvent): number {
  return e.weight === "high" ? 0 : e.weight === "medium" ? 1 : 2;
}

/** Merge scheduled events with per-name events and sort them together. */
export function mergeEvents(scheduled: CalEvent[], named: CalEvent[]): CalEvent[] {
  // Same-day, same-kind name events collapse into one row with all tickers.
  const byKey = new Map<string, CalEvent>();
  for (const e of named) {
    const key = `${e.date}|${e.kind}`;
    const cur = byKey.get(key);
    if (cur) cur.tickers = [...new Set([...(cur.tickers ?? []), ...(e.tickers ?? [])])].sort();
    else byKey.set(key, { ...e, tickers: [...(e.tickers ?? [])].sort() });
  }
  return [...scheduled, ...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) || (a.timeEt ?? "99").localeCompare(b.timeEt ?? "99"),
  );
}
