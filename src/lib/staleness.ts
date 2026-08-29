/**
 * Where "this came from the staging tier" is recorded, so the UI can say so.
 *
 * The proxy answers a failed DGX call from a Supabase snapshot and marks it
 * with `X-FinVibe-Stale: <as_of>`. That header is the only difference between
 * a live response and a staged one — the body is identical by design, which
 * is what makes the fallback transparent to every component. Transparent is
 * exactly the problem for the user: an option chain from three days ago
 * renders like a live one.
 *
 * So the header is captured here, not in the body. Putting `_stale_as_of`
 * into the payload would mean every consumer's type and every chart's
 * key-iteration has to tolerate a field the backend never sends, in ~40
 * components, to serve one banner.
 *
 * This is a module-level store rather than React context because the axios
 * interceptor that writes to it is not inside the tree.
 */

export type StaleEntry = {
  /** Request path, e.g. /api/options/NVDA/summary */
  url: string;
  /** ISO timestamp of the DATA — from the X-FinVibe-Stale header. */
  asOf: string;
  /** "option chain", "verdict", … — for the banner's wording. */
  family: string;
  /** When we observed it, for expiring entries after a recovery. */
  seenAt: number;
};

// Entries older than this are dropped: once DGX is back, fresh responses stop
// carrying the header, and without an expiry the banner would linger over a
// page whose data is now live. Anything still stale re-marks itself on its
// next poll, well inside this window.
const ENTRY_TTL_MS = 5 * 60_000;

let entries: StaleEntry[] = [];
const listeners = new Set<() => void>();
// useSyncExternalStore compares snapshots by identity, so the getter must
// return a stable reference until something actually changes.
let snapshot: StaleEntry[] = entries;

function emit() {
  snapshot = entries;
  for (const l of listeners) l();
}

function prune(now: number) {
  const kept = entries.filter((e) => now - e.seenAt < ENTRY_TTL_MS);
  if (kept.length !== entries.length) {
    entries = kept;
    return true;
  }
  return false;
}

/** A response came back from the staging tier. */
export function noteStale(url: string, asOf: string, family: string) {
  const now = Date.now();
  prune(now);
  const rest = entries.filter((e) => e.url !== url);
  entries = [...rest, { url, asOf, family, seenAt: now }];
  emit();
}

/** A response came back live — clear any stale mark for that path. */
export function noteFresh(url: string) {
  const now = Date.now();
  const changed = prune(now);
  const rest = entries.filter((e) => e.url !== url);
  if (rest.length !== entries.length || changed) {
    entries = rest;
    emit();
  }
}

export function subscribeStale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStaleSnapshot(): StaleEntry[] {
  return snapshot;
}

/** Server render has no stale entries — nothing has been fetched yet. */
export function getStaleServerSnapshot(): StaleEntry[] {
  return EMPTY;
}
const EMPTY: StaleEntry[] = [];

/** Oldest as_of across the current entries — what the banner reports. */
export function oldestAsOf(list: StaleEntry[]): string | null {
  let oldest: string | null = null;
  for (const e of list) {
    if (oldest === null || Date.parse(e.asOf) < Date.parse(oldest)) oldest = e.asOf;
  }
  return oldest;
}
