/**
 * Fibonacci — levels on the last completed leg, and what they mean.
 *
 * A retracement is only as good as the leg it is drawn on, so the tool is
 * three rules rather than a magic number:
 *
 *   1. The leg: the last completed swing on the chart's own timeframe,
 *      taken from the price-action model's swing markers — low to high in
 *      an uptrend, high to low in a downtrend. The same structure the
 *      verdict reads, so the levels agree with the rest of the page.
 *   2. The levels: 38.2, 50, 61.8 and 78.6 retracements (23.6 kept faint),
 *      the 61.8–65 band marked as the golden pocket, and 127.2 / 161.8
 *      extensions of the leg as targets. Invalidation sits at the leg's
 *      origin, past 78.6.
 *   3. Confluence: a level becomes a zone when it lands on something else —
 *      the model's sweet spot, a moving average, a prior swing.
 *
 * No statistics are claimed for any level; this is the configuration with
 * the broadest practitioner consensus, made mechanical. Pure module, no
 * fetching, relative imports only, so `node --test` runs it.
 */

export type SwingMarker = { date: string; type: "H" | "L"; price: number };
export type Direction = "long" | "short";

export type Leg = {
  direction: Direction;
  /** Origin of the move: the low in an uptrend leg, the high in a downtrend leg. */
  from: { date: string; price: number };
  /** End of the move. */
  to: { date: string; price: number };
  /** Whether the leg was anchored by hand rather than from the swings. */
  manual: boolean;
};

export const RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.65, 0.786] as const;
export const EXTENSIONS = [1.272, 1.618] as const;
export const GOLDEN_POCKET: readonly [number, number] = [0.618, 0.65];
/** A level within this fraction of a key level counts as confluent. */
export const CONFLUENCE_TOLERANCE = 0.006;

export type FibLevel = {
  ratio: number;
  price: number;
  kind: "retracement" | "extension";
  /** True for 61.8 and 65: the golden pocket edges. */
  pocket: boolean;
  /** Names of key levels this one lands on. */
  confluence: string[];
};

export type KeyLevels = Record<string, number | null | undefined>;

/**
 * The last completed leg in the given direction. An uptrend leg runs from
 * the last swing low that precedes the last swing high; a downtrend leg
 * from the last swing high that precedes the last swing low. "Completed"
 * means the end point is itself a marker: a leg still being made has no
 * end to retrace from yet.
 */
export function pickLeg(markers: SwingMarker[], direction: Direction): Leg | null {
  const sorted = [...markers].filter((m) => m.date && Number.isFinite(m.price)).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const endType = direction === "long" ? "H" : "L";
  const startType = direction === "long" ? "L" : "H";
  for (let i = sorted.length - 1; i >= 1; i--) {
    if (sorted[i].type !== endType) continue;
    // The nearest opposite swing before it that actually starts the move:
    // in an uptrend the lowest low since the previous high; in a downtrend
    // the highest high since the previous low.
    let j = i - 1;
    let best: SwingMarker | null = null;
    while (j >= 0 && sorted[j].type !== endType) {
      if (sorted[j].type === startType) {
        if (!best || (direction === "long" ? sorted[j].price < best.price : sorted[j].price > best.price)) best = sorted[j];
      }
      j--;
    }
    if (!best) continue;
    if (direction === "long" ? sorted[i].price <= best.price : sorted[i].price >= best.price) continue;
    return { direction, from: { date: best.date, price: best.price }, to: { date: sorted[i].date, price: sorted[i].price }, manual: false };
  }
  return null;
}

/** Retracements measured back from the leg's end, extensions beyond it. */
export function fibLevels(leg: Leg, keyLevels: KeyLevels = {}): FibLevel[] {
  const span = leg.to.price - leg.from.price; // positive in an uptrend leg
  const out: FibLevel[] = [];
  for (const r of RETRACEMENTS) {
    out.push({ ratio: r, price: leg.to.price - span * r, kind: "retracement", pocket: r === GOLDEN_POCKET[0] || r === GOLDEN_POCKET[1], confluence: [] });
  }
  for (const r of EXTENSIONS) {
    out.push({ ratio: r, price: leg.from.price + span * r, kind: "extension", pocket: false, confluence: [] });
  }
  for (const lvl of out) {
    for (const [name, v] of Object.entries(keyLevels)) {
      if (v == null || !Number.isFinite(v) || v <= 0) continue;
      if (Math.abs(lvl.price - v) / v <= CONFLUENCE_TOLERANCE) lvl.confluence.push(name);
    }
  }
  return out;
}

export type FibRead = {
  leg: Leg;
  levels: FibLevel[];
  /** The zone to act in: the golden pocket, ordered low to high. */
  zone: { low: number; high: number; label: string; confluence: string[] };
  targets: number[];
  invalidation: number;
  /** Where the last close sits: above, inside, or below the zone, or past invalidation. */
  position: "above_zone" | "in_zone" | "below_zone" | "invalidated" | "beyond_leg";
  reading: string;
};

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
};

export function fibRead(leg: Leg, lastClose: number, keyLevels: KeyLevels = {}): FibRead {
  const levels = fibLevels(leg, keyLevels);
  const lo = levels.find((l) => l.ratio === GOLDEN_POCKET[0])!;
  const hi = levels.find((l) => l.ratio === GOLDEN_POCKET[1])!;
  const zoneLow = Math.min(lo.price, hi.price);
  const zoneHigh = Math.max(lo.price, hi.price);
  const confl = [...new Set([...lo.confluence, ...hi.confluence])];
  const targets = levels.filter((l) => l.kind === "extension").map((l) => l.price);
  const invalidation = leg.from.price;
  const long = leg.direction === "long";

  let position: FibRead["position"];
  if (long) {
    if (lastClose > leg.to.price) position = "beyond_leg";
    else if (lastClose < invalidation) position = "invalidated";
    else if (lastClose > zoneHigh) position = "above_zone";
    else if (lastClose < zoneLow) position = "below_zone";
    else position = "in_zone";
  } else {
    if (lastClose < leg.to.price) position = "beyond_leg";
    else if (lastClose > invalidation) position = "invalidated";
    else if (lastClose < zoneLow) position = "above_zone"; // not yet retraced up to the zone
    else if (lastClose > zoneHigh) position = "below_zone";
    else position = "in_zone";
  }

  const legText = `the ${fmtDate(leg.from.date)} to ${fmtDate(leg.to.date)} ${long ? "up" : "down"} leg`;
  const zoneWord = long ? "Pullback buy zone" : "Bounce sell zone";
  const conflText = confl.length ? `, on the ${confl.map(prettyKey).join(" and ")}` : "";
  const where =
    position === "in_zone" ? "Price is in the zone now."
    : position === "above_zone" ? (long ? "Price has not pulled back that far yet." : "Price has not bounced that far yet.")
    : position === "below_zone" ? (long ? "Price is through the zone; the next line is invalidation." : "Price is through the zone; the next line is invalidation.")
    : position === "invalidated" ? "The leg is invalidated: price is past its origin."
    : (long ? "Price is above the leg's high: the retracement has not started." : "Price is below the leg's low: the bounce has not started.");
  const reading =
    `${zoneWord} ${money(zoneLow)} to ${money(zoneHigh)}, the golden pocket of ${legText}${conflText}. ` +
    `Invalid ${long ? "below" : "above"} ${money(invalidation)}. Targets ${targets.map(money).join(" and ")}. ${where}`;

  return {
    leg, levels,
    zone: { low: zoneLow, high: zoneHigh, label: "61.8–65%", confluence: confl },
    targets, invalidation, position, reading,
  };
}

function prettyKey(k: string): string {
  return {
    sweet_spot: "sweet spot", weekly_sweet_spot: "weekly sweet spot", weekly_sma50: "weekly 50-day average", sma20: "20-day average", sma50: "50-day average",
    monthly_low: "monthly low", monthly_high: "monthly high", invalidation: "model invalidation", structural_target: "model target",
  }[k] ?? k.replace(/_/g, " ");
}

/** Key levels flattened from a price-action payload for confluence. */
export function keyLevelsFrom(pa: {
  synthesis?: { key_levels?: { sweet_spot?: { low?: number; high?: number } | null; invalidation?: number | null; structural_target?: number | null; support_resistance?: Record<string, number> } };
  timeframes?: Record<string, { structure?: { sma20?: number; sma50?: number }; sweet_spot?: { low?: number; high?: number } | null }>;
} | null | undefined, tfKey: string): KeyLevels {
  const out: KeyLevels = {};
  const kl = pa?.synthesis?.key_levels;
  // The synthesis sweet spot is the weekly one; the timeframe's own sits
  // under its key, so a daily zone can be confluent with the daily spot.
  if (kl?.sweet_spot) { out.weekly_sweet_spot = (Number(kl.sweet_spot.low) + Number(kl.sweet_spot.high)) / 2; }
  if (kl?.invalidation != null) out.invalidation = kl.invalidation;
  if (kl?.structural_target != null) out.structural_target = kl.structural_target;
  for (const [k, v] of Object.entries(kl?.support_resistance ?? {})) if (typeof v === "number") out[k] = v;
  const tf = pa?.timeframes?.[tfKey];
  if (tf?.sweet_spot?.low != null && tf?.sweet_spot?.high != null) out.sweet_spot = (Number(tf.sweet_spot.low) + Number(tf.sweet_spot.high)) / 2;
  if (tf?.structure?.sma20) out.sma20 = tf.structure.sma20;
  if (tf?.structure?.sma50) out.sma50 = tf.structure.sma50;
  return out;
}

/** Everything the chart and the MCP need from a price-action payload. */
export function fibFromPriceAction(
  pa: {
    timeframes?: Record<string, { direction?: string | null; swing_markers?: SwingMarker[]; last_close?: number | null }>;
    synthesis?: { direction?: string | null; last_close?: number | null };
  } | null | undefined,
  tfKey: "daily" | "weekly" | "monthly",
  manual?: Leg | null,
): FibRead | { reading: string; leg: null } {
  const tf = pa?.timeframes?.[tfKey];
  const dirRaw = tf?.direction ?? pa?.synthesis?.direction ?? null;
  const direction: Direction = dirRaw === "short" ? "short" : "long";
  const lastClose = Number(tf?.last_close ?? pa?.synthesis?.last_close ?? NaN);
  const leg = manual ?? pickLeg(tf?.swing_markers ?? [], direction);
  if (!leg) return { leg: null, reading: `No completed ${direction === "long" ? "up" : "down"} leg on the ${tfKey} chart yet, so there is nothing to retrace. Anchor one by hand if you see it.` };
  if (!Number.isFinite(lastClose)) return { leg: null, reading: "No last close in the price-action data." };
  return fibRead(leg, lastClose, keyLevelsFrom(pa as never, tfKey));
}
