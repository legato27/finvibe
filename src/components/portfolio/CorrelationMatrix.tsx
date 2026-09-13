"use client";

/**
 * CorrelationMatrix — an n×n grid of daily-return correlations as SVG.
 *
 * Fill runs short → border → long across −1 … +1 through the palette so it
 * follows the theme; ink is chosen per cell by luminance. Numbers are drawn
 * only when the grid is small enough to read them; otherwise the value sits
 * in the cell's title. Larger books show their biggest positions and say so.
 */
import { useMemo } from "react";
import { divergingScale, inkFor, usePalette } from "@/components/heatmap/palette";

const CELL = 26;
const GUTTER = 44;

export default function CorrelationMatrix({
  tickers,
  corr,
  ariaLabel,
  showNumbers = tickers.length <= 10,
}: {
  tickers: string[];
  corr: number[][];
  ariaLabel: string;
  showNumbers?: boolean;
}) {
  const pal = usePalette();
  const scale = useMemo(() => (pal ? divergingScale(pal, -1, 1, 0) : null), [pal]);
  const n = tickers.length;
  const size = GUTTER + n * CELL;

  if (!pal || !scale || n === 0) {
    return <div className="h-24 animate-pulse rounded-control bg-muted" aria-hidden="true" />;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label={ariaLabel}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block font-mono text-[10px]"
      >
        {tickers.map((t, i) => (
          <g key={`h-${t}`}>
            <text
              x={GUTTER + i * CELL + CELL / 2}
              y={GUTTER - 6}
              textAnchor="start"
              transform={`rotate(-90 ${GUTTER + i * CELL + CELL / 2} ${GUTTER - 6})`}
              fill={pal.mutedFg}
            >
              {t}
            </text>
            <text x={GUTTER - 6} y={GUTTER + i * CELL + CELL / 2 + 3.5} textAnchor="end" fill={pal.mutedFg}>
              {t}
            </text>
          </g>
        ))}
        {tickers.map((a, i) =>
          tickers.map((b, j) => {
            const v = corr[i]?.[j] ?? 0;
            const bg = i === j ? pal.muted : scale(v);
            const ink = inkFor(bg, pal);
            return (
              <g key={`${a}-${b}`}>
                <rect x={GUTTER + j * CELL} y={GUTTER + i * CELL} width={CELL - 1} height={CELL - 1} rx={2} fill={bg}>
                  <title>{`${a} × ${b}: ${v.toFixed(2)}`}</title>
                </rect>
                {showNumbers && i !== j && (
                  <text
                    x={GUTTER + j * CELL + CELL / 2 - 0.5}
                    y={GUTTER + i * CELL + CELL / 2 + 3}
                    textAnchor="middle"
                    fill={ink}
                    pointerEvents="none"
                  >
                    {v >= 0 ? v.toFixed(1).replace(/^0/, "") : `−${Math.abs(v).toFixed(1).replace(/^0/, "")}`}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
