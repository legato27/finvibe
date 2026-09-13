/**
 * Crypto module helpers — pure, relative imports only, so `node --test`
 * runs them and the page, the stock-page note and the MCP tool agree.
 */

export type Lean = "on" | "off" | "neutral";

/** The market-maker bias as the page's lean pill. */
export function leanFromBias(bias: string | null | undefined): Lean {
  const b = (bias ?? "").toLowerCase();
  if (b.startsWith("bull")) return "on";
  if (b.startsWith("bear")) return "off";
  return "neutral";
}

export function setupLabel(setupType: string | null | undefined): string {
  const s = (setupType ?? "").replace(/_/g, " ").trim().toLowerCase();
  if (!s) return "no data";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type SessionLike = {
  active_session?: string | { name: string; ends_in_minutes?: number } | null;
  next_session?: { name: string; starts_in_minutes?: number } | null;
  /** The box lists every session with `active` and `minutes_left`. */
  all_sessions?: Array<{ name: string; active?: boolean; minutes_left?: number | null }> | null;
};

/** "Asia session open" or "NY Open in 60 min". */
export function sessionLine(s: SessionLike | null | undefined): { text: string; active: boolean; minutes: number | null } {
  if (!s) return { text: "Session clock unavailable", active: false, minutes: null };
  const active = s.active_session;
  const name = typeof active === "string" ? active : active?.name;
  if (name) {
    const fromList = (s.all_sessions ?? []).find((x) => x.name === name)?.minutes_left ?? null;
    const ends = typeof active === "object" && active ? active.ends_in_minutes ?? fromList : fromList;
    return { text: ends != null ? `${name} session open, ${fmtMinutes(ends)} left` : `${name} session open`, active: true, minutes: ends };
  }
  const nxt = s.next_session;
  if (nxt?.name) {
    const m = nxt.starts_in_minutes ?? null;
    return { text: m != null ? `${nxt.name} in ${fmtMinutes(m)}` : `Next: ${nxt.name}`, active: false, minutes: m };
  }
  return { text: "No session scheduled", active: false, minutes: null };
}

export function fmtMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

export type LiquidityRow = {
  /** Unique per table: two features can share a range. */
  id: string;
  kind: "pool" | "order_block" | "fvg";
  side: string;
  low: number;
  high: number;
  strength: number | null;
  touches: number | null;
  /** Distance from the current price to the row's nearest edge, as a fraction. */
  distance: number | null;
};

type AnalysisLike = {
  price_data?: { current_price?: number | null } | null;
  liquidity_pools?: Array<{ price: number; type: string; strength?: number; touches?: number }> | null;
  order_blocks?: Array<{ price?: number; low?: number; high?: number; price_low?: number; price_high?: number; type: string; strength?: number; mitigated?: boolean }> | null;
  fvgs?: Array<{ low?: number; high?: number; lower?: number; upper?: number; type: string; filled?: boolean }> | null;
};

/** One table of every liquidity feature, nearest to price first. */
export function liquidityRows(a: AnalysisLike | null | undefined): LiquidityRow[] {
  if (!a) return [];
  const px = a.price_data?.current_price ?? null;
  const dist = (lo: number, hi: number) => (px == null || !px ? null : Math.min(Math.abs(lo - px), Math.abs(hi - px)) / px);
  const out: LiquidityRow[] = [];
  for (const p of a.liquidity_pools ?? []) {
    out.push({ id: "", kind: "pool", side: p.type, low: p.price, high: p.price, strength: p.strength ?? null, touches: p.touches ?? null, distance: dist(p.price, p.price) });
  }
  for (const o of a.order_blocks ?? []) {
    if (o.mitigated) continue;
    const lo = o.price_low ?? o.low ?? o.price ?? NaN, hi = o.price_high ?? o.high ?? o.price ?? NaN;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    out.push({ id: "", kind: "order_block", side: o.type, low: lo, high: hi, strength: o.strength ?? null, touches: null, distance: dist(lo, hi) });
  }
  for (const f of a.fvgs ?? []) {
    if (f.filled) continue;
    const lo = f.lower ?? f.low ?? NaN, hi = f.upper ?? f.high ?? NaN;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    out.push({ id: "", kind: "fvg", side: f.type, low: lo, high: hi, strength: null, touches: null, distance: dist(lo, hi) });
  }
  out.sort((x, y) => (x.distance ?? Infinity) - (y.distance ?? Infinity));
  return out.map((r, i) => ({ ...r, id: `${r.kind}-${i}` }));
}

/** A price-action-shaped object so the shared chart draws the setup's levels. */
export function setupAsPriceAction(setup: {
  entry_zone?: { low: number; high: number } | null; stop_level?: number | null; target_1?: number | null; target_2?: number | null; invalidation?: number | null;
} | null | undefined) {
  if (!setup) return undefined;
  const sr: Record<string, number> = {};
  if (setup.target_2 != null) sr.target_2 = setup.target_2;
  if (setup.invalidation != null) sr.mm_invalidation = setup.invalidation;
  return {
    synthesis: {
      key_levels: {
        sweet_spot: setup.entry_zone ?? null,
        invalidation: setup.stop_level ?? null,
        structural_target: setup.target_1 ?? null,
        support_resistance: sr,
      },
    },
    timeframes: {},
  };
}

/** Equity curve points scaled to a small SVG box. */
export function equityPath(curve: number[], w = 160, h = 40): { d: string; min: number; max: number } {
  if (!curve.length) return { d: "", min: 0, max: 0 };
  const min = Math.min(0, ...curve), max = Math.max(0, ...curve);
  const range = max - min || 1;
  const pts = curve.map((v, i) => `${((i / Math.max(1, curve.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`);
  return { d: `M${pts.join(" L")}`, min, max };
}
