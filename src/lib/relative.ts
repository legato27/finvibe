/**
 * One wording for "how old is this" so two age labels on the same screen
 * never describe the same instant differently.
 */
export function relativeAge(fromMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - fromMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
