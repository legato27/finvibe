"use client";

/**
 * Freshness — the one "how live is this" chip.
 *
 * Replaces the four green dots and the sticky stale banner. Lime dot means
 * the data is live (or the page is polling it); amber dot means the reader is
 * looking at a stored copy and the chip says how old. Never red: a stored
 * copy is a caution, not an error. Absolute time on hover, and in the
 * accessible name, so touch users get it too.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { absoluteTime, relativeAge } from "@/lib/relative";
import {
  getStaleServerSnapshot,
  getStaleSnapshot,
  oldestAsOf,
  subscribeStale,
  type StaleEntry,
} from "@/lib/staleness";

export type FreshnessProps = {
  /** ISO timestamp of the data. Omit for "live". */
  at?: string | null;
  /** True when the data is a stored copy rather than a live read. */
  stale?: boolean;
  /** Leading word; defaults to "updated" or "stored copy". */
  label?: string;
  /** Trailing note, e.g. "60s" for a polling interval. */
  note?: string;
  className?: string;
};

export function useTick(ms = 30_000, enabled = true) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

export default function Freshness({ at, stale = false, label, note, className = "" }: FreshnessProps) {
  useTick(30_000, !!at);
  const ms = at ? new Date(at).getTime() : NaN;
  const hasTime = !Number.isNaN(ms);
  const word = label ?? (stale ? "stored copy" : hasTime ? "updated" : "live");
  const text = hasTime ? `${word} ${relativeAge(ms)}` : word;
  const title = hasTime ? `${word}: ${absoluteTime(ms)}` : undefined;
  return (
    <span
      role="status"
      title={title}
      aria-label={title ?? text}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full ${stale ? "bg-signal-caution" : "bg-primary"}`}
      />
      {text}
      {note && <span className="text-dim">· {note}</span>}
    </span>
  );
}

/**
 * The header chip. Subscribes to the staleness store the API proxy writes to:
 * when any response came from the staging tier it turns amber and names the
 * oldest data; otherwise it reads "live". Not dismissible, by design — the
 * failure being guarded is someone reading a stored option chain as live.
 */
export function HeaderFreshness({ className = "" }: { className?: string }) {
  const entries = useSyncExternalStore(subscribeStale, getStaleSnapshot, getStaleServerSnapshot);
  if (!entries.length) return <Freshness className={className} />;
  const asOf = oldestAsOf(entries);
  const title = describe(entries);
  return (
    <span title={title} className="inline-flex">
      <Freshness at={asOf} stale className={className} />
    </span>
  );
}

// Name what is stale, not just that something is.
function describe(entries: StaleEntry[]): string {
  const families = [...new Set(entries.map((e) => e.family))].sort();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (families.length === 0) return "Stored data";
  if (families.length === 1) return `${cap(families[0])} is a stored copy`;
  return `${cap(families[0])} and ${families.slice(1).join(", ")} are stored copies`;
}
