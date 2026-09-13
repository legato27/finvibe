"use client";

/**
 * RotationQuadrant — eleven sectors as dots on relative strength against
 * SPY (x) and the momentum of that strength (y), 100 at the centre of both.
 * Each dot trails its last four weekly positions so the reader sees the
 * direction of travel, not just where a sector sits. Dot size is market
 * cap. Quadrant colours come from the palette: long for leading, protocol
 * cyan for improving, caution for weakening, short for lagging.
 */
import { useMemo } from "react";
import { inkFor, usePalette, type Palette } from "@/components/heatmap/palette";
import type { Quadrant, RotationPoint } from "@/lib/rotation";

export type QuadrantSector = {
  key: string;
  /** Short label drawn next to the dot (the ETF ticker). */
  label: string;
  /** Full sector name for the title. */
  name: string;
  size: number;
  current: RotationPoint;
  trail: RotationPoint[];
  quadrant: Quadrant;
};

const W = 640;
const H = 400;
const PAD = { l: 44, r: 16, t: 20, b: 36 };

export function quadrantColor(q: Quadrant, pal: Palette): string {
  return q === "leading" ? pal.long : q === "improving" ? pal.protocol : q === "weakening" ? pal.caution : pal.short;
}

export default function RotationQuadrant({
  sectors,
  ariaLabel,
  labels,
  axisX,
  axisY,
}: {
  sectors: QuadrantSector[];
  ariaLabel: string;
  labels: Record<Quadrant, string>;
  axisX: string;
  axisY: string;
}) {
  const pal = usePalette();

  const { sx, sy, span } = useMemo(() => {
    let span = 2;
    for (const s of sectors) for (const p of [...s.trail, s.current]) {
      span = Math.max(span, Math.abs(p.x - 100), Math.abs(p.y - 100));
    }
    span *= 1.15;
    const sx = (x: number) => PAD.l + ((x - (100 - span)) / (2 * span)) * (W - PAD.l - PAD.r);
    const sy = (y: number) => PAD.t + ((100 + span - y) / (2 * span)) * (H - PAD.t - PAD.b);
    return { sx, sy, span };
  }, [sectors]);

  const maxSize = useMemo(() => sectors.reduce((m, s) => Math.max(m, s.size), 0) || 1, [sectors]);
  const radius = (size: number) => 5 + 11 * Math.sqrt(size / maxSize);

  if (!pal) return <div className="aspect-[8/5] w-full animate-pulse rounded-control bg-muted" aria-hidden="true" />;

  const cx = sx(100), cy = sy(100);
  const ticks = [-span * 0.6, span * 0.6].map((d) => 100 + d);

  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${H}`} className="block w-full font-mono">
      {/* quadrant grounds */}
      <rect x={cx} y={PAD.t} width={W - PAD.r - cx} height={cy - PAD.t} fill={pal.long} opacity={0.06} />
      <rect x={cx} y={cy} width={W - PAD.r - cx} height={H - PAD.b - cy} fill={pal.caution} opacity={0.06} />
      <rect x={PAD.l} y={cy} width={cx - PAD.l} height={H - PAD.b - cy} fill={pal.short} opacity={0.06} />
      <rect x={PAD.l} y={PAD.t} width={cx - PAD.l} height={cy - PAD.t} fill={pal.protocol} opacity={0.06} />

      {/* axes through 100 */}
      <line x1={PAD.l} x2={W - PAD.r} y1={cy} y2={cy} stroke={pal.border} strokeWidth={1} />
      <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} stroke={pal.border} strokeWidth={1} />
      {ticks.map((v) => (
        <g key={v}>
          <text x={sx(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill={pal.mutedFg}>{v.toFixed(1)}</text>
          <text x={PAD.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill={pal.mutedFg}>{v.toFixed(1)}</text>
        </g>
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={pal.mutedFg}>{axisX} →</text>
      <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" fontSize={10} fill={pal.mutedFg} transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>{axisY} →</text>

      {/* quadrant names */}
      <text x={W - PAD.r - 6} y={PAD.t + 14} textAnchor="end" fontSize={10} letterSpacing={1.5} fill={pal.long}>{labels.leading.toUpperCase()}</text>
      <text x={W - PAD.r - 6} y={H - PAD.b - 8} textAnchor="end" fontSize={10} letterSpacing={1.5} fill={pal.caution}>{labels.weakening.toUpperCase()}</text>
      <text x={PAD.l + 6} y={H - PAD.b - 8} textAnchor="start" fontSize={10} letterSpacing={1.5} fill={pal.short}>{labels.lagging.toUpperCase()}</text>
      <text x={PAD.l + 6} y={PAD.t + 14} textAnchor="start" fontSize={10} letterSpacing={1.5} fill={pal.protocol}>{labels.improving.toUpperCase()}</text>

      {/* trails under dots */}
      {sectors.map((s) => {
        const c = quadrantColor(s.quadrant, pal);
        const pts = s.trail.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
        return (
          <g key={`trail-${s.key}`}>
            {s.trail.length > 1 && <polyline points={pts} fill="none" stroke={c} strokeWidth={1.5} strokeOpacity={0.55} strokeLinejoin="round" />}
            {s.trail.slice(0, -1).map((p, i) => (
              <circle key={p.time} cx={sx(p.x)} cy={sy(p.y)} r={2.2} fill={c} opacity={0.25 + (0.5 * i) / Math.max(1, s.trail.length - 1)} />
            ))}
          </g>
        );
      })}

      {/* dots, largest first so small ones draw on top. A dot that lands on
          a larger one carries its label above itself instead of inside, so
          two sectors at the same point stay two readable names. */}
      {(() => {
        const ordered = [...sectors].sort((a, b) => b.size - a.size);
        const pos = ordered.map((s) => ({ x: sx(s.current.x), y: sy(s.current.y), r: radius(s.size) }));
        const touches = (i: number, j: number) => Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < (pos[i].r + pos[j].r) * 0.8;
        return ordered.map((s, i) => {
          const c = quadrantColor(s.quadrant, pal);
          const { x, y, r } = pos[i];
          // Under a bigger dot: label above. Over a smaller one: label below.
          const underBigger = pos.some((_, j) => j < i && touches(i, j));
          const overSmaller = !underBigger && pos.some((_, j) => j > i && touches(i, j));
          const outside = underBigger || overSmaller;
          return (
            <g key={s.key}>
              <circle cx={x} cy={y} r={r} fill={c} fillOpacity={0.85} stroke={pal.panel} strokeWidth={1.5}>
                <title>{`${s.name} (${s.label}) · ${labels[s.quadrant]} · RS ${s.current.x.toFixed(1)} · momentum ${s.current.y.toFixed(1)}`}</title>
              </circle>
              {outside ? (
                <text x={x} y={underBigger ? y - r - 4 : y + r + 11} textAnchor="middle" fontSize={9} fontWeight={700} fill={c} stroke={pal.panel} strokeWidth={3} paintOrder="stroke" pointerEvents="none">
                  {s.label}
                </text>
              ) : (
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize={r >= 9 ? 9 : 8} fontWeight={700} fill={inkFor(c, pal)} pointerEvents="none">
                  {s.label}
                </text>
              )}
            </g>
          );
        });
      })()}
    </svg>
  );
}
