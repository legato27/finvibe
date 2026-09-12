"use client";

/**
 * Colour resolution shared by the heatmap page and the dashboard sector card.
 *
 * Every fill comes from the app's CSS signal tokens, read at render time, so
 * both surfaces follow the theme toggle with no second palette in code. The
 * tokens are tuned as TEXT colours (green-800 on the light ground, green-400
 * on the dark one); as fills over large areas the dark steps are far too
 * bright, so in dark mode each signal tone is pulled one Lab step towards the
 * ground before it becomes a tile.
 */
import { useEffect, useState } from "react";
import { hsl as d3hsl, lab as d3lab, scaleLinear, interpolateLab } from "d3";
import type { Metric, Tone } from "@/lib/heatmap";

export type Palette = Record<Tone | "divMid" | "seqLo" | "seqHi" | "ink" | "inkOnDark", string>;

function readToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return raw || "#888888";
  return d3hsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100).formatHex();
}

export function readPalette(): Palette {
  const dark = document.documentElement.classList.contains("dark");
  const fill = (name: string) => {
    const c = readToken(name);
    return dark ? d3lab(c).darker(1).formatHex() : c;
  };
  return {
    long: fill("--signal-long"),
    "long-strong": fill("--signal-long-strong"),
    short: fill("--signal-short"),
    "short-strong": fill("--signal-short-strong"),
    neutral: fill("--signal-neutral"),
    conflict: fill("--signal-conflict"),
    caution: fill("--signal-caution"),
    divMid: readToken("--border"),
    seqLo: readToken("--muted"),
    seqHi: readToken("--primary"),
    ink: readToken("--foreground"),
    inkOnDark: "#ffffff",
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

/** Diverging scale for a plain numeric window: red below `mid`, green above. */
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
  return l > 62 ? "#13151c" : pal.inkOnDark;
}
