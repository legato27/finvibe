/**
 * Volume-by-price ("volume profile" / VPVR) computation.
 *
 * A volume profile turns the usual time-axis volume histogram on its side: it
 * buckets the range between the highest high and the lowest low into `rows`
 * price bands and asks, for each band, how much volume changed hands *at that
 * price*. Long bar = a price the market spent a lot of size on (an acceptance
 * area, where institutions filled); short bar = a price it passed through
 * quickly (rejection).
 *
 * Two approximations are worth stating plainly, because OHLCV bars are all we
 * have — a true profile needs tick data:
 *
 *  1. Volume is spread across each bar's high→low range in proportion to how
 *     much of the band the bar overlaps, rather than being placed at the exact
 *     prices it traded at. This is the standard OHLC approximation and is why
 *     the shape, not the absolute per-band number, is the signal.
 *  2. The buy/sell split classifies a bar's *whole* volume by its direction
 *     (close ≥ open → buying, else selling). Real up/down-tick classification
 *     is not recoverable from a daily or weekly bar.
 */

export interface VpBar {
  time:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface VpBucket {
  /** Lower price edge of the band. */
  low:   number;
  /** Upper price edge of the band. */
  high:  number;
  /** Mid price of the band — what the row is labelled by. */
  mid:   number;
  /** Volume attributed to up-bars (close ≥ open). */
  buy:   number;
  /** Volume attributed to down-bars. */
  sell:  number;
  /** buy + sell. */
  total: number;
}

export interface VolumeProfile {
  buckets:  VpBucket[];
  /** Largest `total` across buckets — the scale every bar is drawn against. */
  maxTotal: number;
  /** Point of Control: the band that traded the most volume. */
  poc:      VpBucket | null;
  /** Value-area bounds — the contiguous band around the POC holding `vaPct`. */
  vaLow:    number;
  vaHigh:   number;
  /** Total volume summed over the window. */
  totalVolume: number;
  /** Number of bars that fed the profile. */
  barCount: number;
  /** First and last bar dates in the window (YYYY-MM-DD). */
  from: string;
  to:   string;
}

const EMPTY: VolumeProfile = {
  buckets: [], maxTotal: 0, poc: null, vaLow: 0, vaHigh: 0,
  totalVolume: 0, barCount: 0, from: "", to: "",
};

/**
 * Keep only the bars whose date falls within `days` calendar days of the last
 * bar. Works for any interval — 188 days is ~188 daily bars, ~27 weekly ones —
 * so the window means the same thing however the chart is bucketed.
 */
export function sliceByDays(bars: VpBar[], days: number): VpBar[] {
  if (bars.length === 0 || !Number.isFinite(days)) return bars;
  const last = new Date(bars[bars.length - 1].time + "T00:00:00Z").getTime();
  if (!Number.isFinite(last)) return bars;
  const cutoff = last - days * 86_400_000;
  return bars.filter((b) => {
    const t = new Date(b.time + "T00:00:00Z").getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * Build the profile. `rows` is the number of price bands; more rows resolves
 * finer shelves but gets noisy once bands are thinner than the typical bar.
 * `vaPct` is the share of volume the value area covers (0.7 is the convention).
 */
export function computeVolumeProfile(
  bars: VpBar[],
  rows = 48,
  vaPct = 0.7,
): VolumeProfile {
  const usable = bars.filter(
    (b) => Number.isFinite(b.high) && Number.isFinite(b.low) && b.high > 0 && b.volume > 0,
  );
  if (usable.length === 0 || rows < 2) return EMPTY;

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of usable) {
    if (b.low  < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
  }
  // A perfectly flat window would divide by zero; pad it into a real range.
  if (!(hi > lo)) {
    const pad = Math.max(hi * 0.001, 0.01);
    lo -= pad;
    hi += pad;
  }

  const step = (hi - lo) / rows;
  const buckets: VpBucket[] = Array.from({ length: rows }, (_, i) => {
    const bLow  = lo + i * step;
    const bHigh = bLow + step;
    return { low: bLow, high: bHigh, mid: (bLow + bHigh) / 2, buy: 0, sell: 0, total: 0 };
  });

  for (const b of usable) {
    const isBuy = b.close >= b.open;
    const barLow  = Math.max(b.low,  lo);
    const barHigh = Math.min(b.high, hi);
    const span    = barHigh - barLow;

    if (span <= 0) {
      // Doji / flat bar: everything lands in the single band containing it.
      const idx = Math.min(rows - 1, Math.max(0, Math.floor((barLow - lo) / step)));
      const bk = buckets[idx];
      if (isBuy) bk.buy += b.volume; else bk.sell += b.volume;
      continue;
    }

    const first = Math.min(rows - 1, Math.max(0, Math.floor((barLow  - lo) / step)));
    const last  = Math.min(rows - 1, Math.max(0, Math.ceil ((barHigh - lo) / step) - 1));
    for (let i = first; i <= last; i++) {
      const bk = buckets[i];
      const overlap = Math.min(bk.high, barHigh) - Math.max(bk.low, barLow);
      if (overlap <= 0) continue;
      const share = (overlap / span) * b.volume;
      if (isBuy) bk.buy += share; else bk.sell += share;
    }
  }

  let maxTotal = 0;
  let totalVolume = 0;
  let pocIdx = -1;
  buckets.forEach((bk, i) => {
    bk.total = bk.buy + bk.sell;
    totalVolume += bk.total;
    if (bk.total > maxTotal) { maxTotal = bk.total; pocIdx = i; }
  });

  if (pocIdx < 0) return EMPTY;

  // Value area: start at the POC and keep absorbing whichever neighbouring band
  // holds more volume until `vaPct` of the window's volume is inside.
  let lower = pocIdx;
  let upper = pocIdx;
  let acc = buckets[pocIdx].total;
  const target = totalVolume * vaPct;
  while (acc < target && (lower > 0 || upper < rows - 1)) {
    const below = lower > 0        ? buckets[lower - 1].total : -1;
    const above = upper < rows - 1 ? buckets[upper + 1].total : -1;
    if (above >= below) { upper += 1; acc += buckets[upper].total; }
    else                { lower -= 1; acc += buckets[lower].total; }
  }

  return {
    buckets,
    maxTotal,
    poc: buckets[pocIdx],
    vaLow:  buckets[lower].low,
    vaHigh: buckets[upper].high,
    totalVolume,
    barCount: usable.length,
    from: usable[0].time,
    to:   usable[usable.length - 1].time,
  };
}
