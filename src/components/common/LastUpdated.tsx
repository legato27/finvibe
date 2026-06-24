"use client";

import { useEffect, useState } from "react";

// Compact "Updated <relative>" badge for screener/job-produced datasets.
// Renders nothing until a valid timestamp is present (these pages fetch data
// client-side, so there is no SSR value to mismatch on). The absolute local
// time is shown on hover.

function relative(fromMs: number): string {
  const s = Math.max(0, Math.round((Date.now() - fromMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function LastUpdated({
  at,
  label = "Updated",
  className = "",
}: {
  at?: string | null;
  label?: string;
  className?: string;
}) {
  // Recompute the relative label on mount and every minute so it stays fresh.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!at) return null;
  const ms = new Date(at).getTime();
  if (Number.isNaN(ms)) return null;

  const abs = new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <span
      className={`text-[11px] text-muted-foreground whitespace-nowrap ${className}`}
      title={`${label}: ${abs}`}
    >
      {label} {relative(ms)}
    </span>
  );
}
