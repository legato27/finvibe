"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getStaleServerSnapshot,
  getStaleSnapshot,
  oldestAsOf,
  subscribeStale,
  type StaleEntry,
} from "@/lib/staleness";

/**
 * Says out loud when the page is being served from the staging tier.
 *
 * The proxy's fallback is deliberately transparent — a staged verdict has the
 * same body as a live one, which is why every component keeps working when
 * the DGX box is unreachable. The cost of that transparency is that nothing
 * on screen would otherwise distinguish a chain summary fetched a second ago
 * from one stored three days ago. This is the thing that distinguishes them.
 *
 * Not dismissible. A banner the user can close is a banner they close once
 * and never see again, and the failure mode being guarded against is someone
 * reading a stale option chain as live and trading on it.
 */
export default function StaleDataBanner() {
  const entries = useSyncExternalStore(
    subscribeStale,
    getStaleSnapshot,
    getStaleServerSnapshot,
  );

  // Re-render every 30s so "2h ago" does not sit frozen while the outage runs.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!entries.length) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [entries.length]);

  if (!entries.length) return null;

  const asOf = oldestAsOf(entries);
  if (!asOf) return null;
  const ms = Date.parse(asOf);
  if (Number.isNaN(ms)) return null;

  const abs = new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Sticky at top-[57px] — directly under the Navbar, which is `sticky top-0`
  // and h-14 plus a 1px border. A banner that scrolls away is one the reader
  // has stopped seeing by the time they reach the Options tab, which is the
  // surface where "is this live?" matters most.
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-[57px] z-40 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-900 backdrop-blur dark:text-amber-200"
    >
      <div className="container mx-auto max-w-[1600px] flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
        <span className="font-medium">
          Live data unavailable — showing a stored copy from {relative(ms)}.
        </span>
        <span className="text-amber-800/80 dark:text-amber-200/70">
          {describe(entries)} · as of {abs}
        </span>
      </div>
    </div>
  );
}

// Name what is stale, not just that something is. "Option chain" carries a
// different weight from "verdict" — one is a structural read that degrades
// gracefully over days, the other moves every session.
function describe(entries: StaleEntry[]): string {
  const families = [...new Set(entries.map((e) => e.family))].sort();
  if (families.length === 0) return "Stored data";
  if (families.length === 1) return capitalize(families[0]);
  if (families.length === 2) return `${capitalize(families[0])} and ${families[1]}`;
  return `${capitalize(families[0])}, ${families.slice(1, -1).join(", ")} and ${
    families[families.length - 1]
  }`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Same wording as components/common/LastUpdated so two age labels on the same
// screen do not describe the same instant differently.
function relative(fromMs: number): string {
  const s = Math.max(0, Math.round((Date.now() - fromMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
