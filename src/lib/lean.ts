/**
 * Market-level lean. Several independent regime reads (the synthesised
 * "today" regime, the VIX zone, the swarm, the business cycle) can openly
 * contradict; each is normalised to risk-on / neutral / risk-off here so the
 * call strip can say whether they agree, and lean accordingly.
 */
export type Lean = "on" | "off" | "neutral";

export function vixLean(zone?: string): Lean | null {
  if (!zone) return null;
  if (zone === "COMPLACENCY" || zone === "LOW_VOLATILITY") return "on";
  if (zone === "NORMAL") return "neutral";
  if (zone === "ELEVATED" || zone === "EXTREME_FEAR") return "off";
  return null;
}
export function cycleLean(state?: string): Lean | null {
  if (!state) return null;
  if (state === "Expansion") return "on";
  if (state === "Contraction") return "off";
  if (state === "Peak" || state === "Trough") return "neutral";
  return null;
}
export function swarmLean(type?: string): Lean | null {
  if (!type) return null;
  if (type === "White") return "on";
  if (type === "Black") return "off";
  return "neutral";
}
export function regimeColorLean(color?: string): Lean | null {
  if (!color) return null;
  if (color === "green") return "on";
  if (color === "yellow") return "neutral";
  if (color === "orange" || color === "red") return "off";
  return null;
}

export const LEAN_TEXT: Record<Lean, string> = {
  on: "text-signal-long",
  off: "text-signal-short",
  neutral: "text-signal-neutral",
};
export const LEAN_DOT: Record<Lean, string> = {
  on: "bg-signal-long",
  off: "bg-signal-short",
  neutral: "bg-signal-neutral",
};

export type LeanRow = { label: string; lean: Lean };

/** Headline agreement across the rows: conflicting when both directions are
 *  present, otherwise the dominant lean. */
export function agreement(rows: LeanRow[]): { headline: "conflict" | "on" | "off" | "mixed"; agree: number } {
  const on = rows.filter((r) => r.lean === "on").length;
  const off = rows.filter((r) => r.lean === "off").length;
  if (on > 0 && off > 0) return { headline: "conflict", agree: Math.max(on, off) };
  if (on > 0) return { headline: "on", agree: on };
  if (off > 0) return { headline: "off", agree: off };
  return { headline: "mixed", agree: rows.length };
}
