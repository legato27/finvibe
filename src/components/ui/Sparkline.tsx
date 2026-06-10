/**
 * Sparkline — tiny inline trend SVG (e.g. IV-rank history in the screener).
 * Decorative for sighted scanning; the accessible value lives in the adjacent
 * cell text, so the SVG itself is aria-hidden with a title fallback.
 */
export default function Sparkline({
  values,
  width = 64,
  height = 20,
  className = "text-primary",
  title,
}: {
  values: number[] | null | undefined;
  width?: number;
  height?: number;
  className?: string;
  title?: string;
}) {
  if (!values || values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {title && <title>{title}</title>}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
