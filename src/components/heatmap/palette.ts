"use client";

/**
 * Colour resolution for every chart, gauge and treemap.
 *
 * Nothing in a component names a colour. Each fill and stroke comes from the
 * CSS tokens in app/globals.css, read at render time, so every surface follows
 * the theme toggle with no second palette in code. The directional tokens are
 * tuned as TEXT colours; as fills over large areas the dark steps are too
 * bright, so in dark mode `fill()` pulls a tone one Lab step towards the
 * ground before it becomes a tile.
 */
import { useEffect, useState } from "react";
import { hsl as d3hsl, lab as d3lab, scaleLinear, interpolateLab } from "d3";
import type { Metric, Tone } from "@/lib/heatmap";

export type Palette = Record<
  | Tone
  | "divMid" | "seqLo" | "seqHi" | "ink" | "inkOnDark"
  // surfaces and text
  | "bg" | "panel" | "raised" | "border" | "muted" | "mutedFg"
  // accents as text
  | "signal" | "protocol" | "break" | "amber"
  // accent as fill
  | "primary",
  string
> & { chart: string[]; dark: boolean };

/** Resolve one CSS token to a hex string. Accepts the HSL-triple form used in
 *  globals.css or any colour string the browser already understands. */
export function readToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return raw || "#888888";
  return d3hsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100).formatHex();
}

/** A token with alpha as an `rgba()` string. Canvas libraries
 *  (lightweight-charts) parse hex and rgb() only, so this never emits hsl. */
export function tokenAlpha(name: string, alpha: number): string {
  const c = d3hsl(readToken(name)).rgb();
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
}

export function readPalette(): Palette {
  const dark = document.documentElement.classList.contains("dark");
  const fill = (name: string) => {
    const c = readToken(name);
    return dark ? d3lab(c).darker(1).formatHex() : c;
  };
  return {
    dark,
    long: fill("--signal-long"),
    "long-strong": fill("--signal-long-strong"),
    short: fill("--signal-short"),
    "short-strong": fill("--signal-short-strong"),
    neutral: fill("--signal-neutral"),
    conflict: fill("--signal-conflict"),
    caution: fill("--signal-caution"),
    divMid: readToken("--border"),
    seqLo: readToken("--muted"),
    seqHi: readToken("--signal"),
    ink: readToken("--foreground"),
    inkOnDark: readToken("--foreground"),
    bg: readToken("--background"),
    panel: readToken("--card"),
    raised: readToken("--raised"),
    border: readToken("--border"),
    muted: readToken("--muted"),
    mutedFg: readToken("--muted-foreground"),
    signal: readToken("--signal"),
    protocol: readToken("--protocol"),
    break: readToken("--signal-break"),
    amber: readToken("--signal-caution"),
    primary: readToken("--primary"),
    chart: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => readToken(`--chart-${i}`)),
  };
}

/** Bumps whenever the <html> class list changes — i.e. on a theme toggle. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return v;
}

/** The palette for the current theme, or null during SSR. */
export function usePalette(): Palette | null {
  const themeVersion = useThemeVersion();
  const [pal, setPal] = useState<Palette | null>(null);
  useEffect(() => setPal(readPalette()), [themeVersion]);
  return pal;
}

/** Diverging scale for a plain numeric window: short below `mid`, long above. */
export function divergingScale(pal: Palette, lo: number, hi: number, mid = (lo + hi) / 2): (v: number) => string {
  const s = scaleLinear<string>().domain([lo, mid, hi])
    .range([pal.short, pal.divMid, pal.long]).interpolate(interpolateLab).clamp(true);
  return (v) => s(v);
}

export function colorFor(metric: Metric, pal: Palette): (v: number | string) => string {
  if (metric.kind === "cat") return (v) => pal[metric.tone(String(v))];
  if (metric.kind === "div") {
    const s = divergingScale(pal, metric.lo, metric.hi, metric.mid);
    return (v) => s(Number(v));
  }
  const s = scaleLinear<string>().domain([metric.lo, metric.hi])
    .range([pal.seqLo, pal.seqHi]).interpolate(interpolateLab).clamp(true);
  return (v) => s(Number(v));
}

/** Text colour that reads on a given fill. */
export function inkFor(bg: string, pal: Palette): string {
  const l = d3lab(bg)?.l ?? 50;
  // Light fills take the dark theme's ink, dark fills take the light one.
  return l > 62 ? (pal.dark ? pal.bg : pal.ink) : (pal.dark ? pal.ink : pal.panel);
}
