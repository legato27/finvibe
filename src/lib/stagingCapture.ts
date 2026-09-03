/**
 * The write half of the staging tier: keeping a copy of what DGX said, as
 * it goes past.
 *
 * 017's four families are written from DGX by a reconcile task, which is
 * the right shape for data DGX already has in a table. It is the wrong
 * shape for everything else: /api/stocks/{t}/detail, the macro dashboard,
 * FX rates and the batch columns are all COMPOSED by the API at request
 * time, so mirroring them from the box would mean re-running the
 * composition on a schedule for names nobody is looking at.
 *
 * Capturing on the way through instead means the cache contains exactly
 * what the app asked for, as recently as it asked, and the copy is
 * byte-identical to the live response by construction — no serializer on
 * either side to drift.
 *
 * Everything here is best-effort and silent on failure. It runs after the
 * response has already been handed to the user (see `after()` in
 * src/lib/proxy.ts): a capture that threw would turn a served request into
 * a failed one, which is the exact inversion of the point.
 */

import { createServiceSupabase } from "@/lib/supabase/service";
import { pooledMap } from "@/lib/util/pool";
import {
  BATCH_FAMILIES,
  assertShareable,
  captureKey,
  matchPathFamily,
  type BatchKind,
} from "@/lib/stagingPaths";

/**
 * Bodies past this are not captured. The largest legitimate response is the
 * macro dashboard at a few hundred KB; anything at the megabyte scale is
 * either a full chain dump or a mistake, and neither is worth the row.
 */
const MAX_BODY_BYTES = 1_500_000;

/**
 * A local echo of the throttle the RPC already enforces.
 *
 * The database decides authoritatively whether a capture is due — it has to,
 * since concurrent lambdas would otherwise race — but calling it to be told
 * "not yet" is still a round trip per request, and the dashboard alone polls
 * ten endpoints a minute per open tab. A warm instance therefore remembers
 * what it recently wrote and skips the call entirely.
 *
 * Being per-instance it is only ever a hint: a cold start forgets, several
 * instances each get one call through, and the RPC absorbs the rest. Wrong
 * in the safe direction — the worst case is the round trip we used to make
 * every time.
 */
const recentCaptures = new Map<string, number>();
const RECENT_MAX_KEYS = 2_000;

// Family and key are joined on a NUL because it is the one character that
// cannot appear in either — a request path or a ticker could contain any
// printable separator. Written as an escape, not as a literal byte: a NUL in
// the source makes git treat the whole file as binary.
const SEP = "\u0000";

function recentlyCaptured(family: string, key: string, withinMs: number): boolean {
  if (withinMs <= 0) return false;
  const last = recentCaptures.get(`${family}${SEP}${key}`);
  return last !== undefined && Date.now() - last < withinMs;
}

function noteCaptured(family: string, key: string): void {
  // Bounded so a long-lived instance walking the whole catalog cannot grow
  // this without limit. Oldest-inserted goes first; Map preserves that order.
  if (recentCaptures.size >= RECENT_MAX_KEYS) {
    const oldest = recentCaptures.keys().next().value;
    if (oldest !== undefined) recentCaptures.delete(oldest);
  }
  recentCaptures.set(`${family}${SEP}${key}`, Date.now());
}

/** Capture a successful GET response for an allowlisted path. */
export async function capturePathResponse(path: string, raw: string): Promise<void> {
  const family = matchPathFamily(path);
  if (!family) return;
  if (!assertShareable(path)) {
    // Unreachable unless PATH_FAMILIES has been widened over a user-scoped
    // prefix. Loud, because the failure it prevents is silent.
    console.error(`[staging] refusing to capture user-scoped path ${path}`);
    return;
  }
  const key = captureKey(path);
  if (!key) return;
  if (raw.length > MAX_BODY_BYTES) return;
  if (recentlyCaptured("path", key, family.refreshAfter)) return;

  const body = parseJson(raw);
  if (body === undefined) return;
  if (!worthKeeping(body)) return;

  await write("path", key, body, dataAsOf(body), family.refreshAfter);
}

/**
 * Capture a successful batch response, decomposed per ticker.
 *
 * The response is `{ TICKER: value | null }`, so storing it per ticker
 * rather than per request means a capture taken while looking at one
 * watchlist partly answers a request for another. Null entries are skipped:
 * "DGX has no verdict for this name" is an answer worth serving live and
 * not worth storing, and storing it would let an absence outlive the
 * computation that filled it in.
 */
export async function captureBatchResponse(
  kind: BatchKind,
  raw: string,
): Promise<void> {
  const spec = BATCH_FAMILIES[kind];
  if (!spec.refreshAfter) return; // prices are read from stock_catalog instead
  if (raw.length > MAX_BODY_BYTES) return;

  const body = parseJson(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) return;

  const supabase = service();
  if (!supabase) return;

  const entries = Object.entries(body as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && worthKeeping(v))
    .map(([ticker, value]) => [ticker.toUpperCase(), value] as const)
    .filter(([ticker]) => !recentlyCaptured(spec.family, ticker, spec.refreshAfter));

  // A watchlist batch is ~40 names and the ranked book ~140, so this is the
  // one place the tier could stampede Supabase. Bounded in flight, and most
  // of the list is normally filtered out above before it gets here.
  await pooledMap(entries, 8, ([ticker, value]) =>
    write(spec.family, ticker, value, dataAsOf(value), spec.refreshAfter, supabase),
  );
}

async function write(
  family: string,
  key: string,
  body: unknown,
  asOf: string | null,
  refreshAfterMs: number,
  client?: ReturnType<typeof createServiceSupabase>,
): Promise<void> {
  const supabase = client ?? service();
  if (!supabase) return;
  const { error } = await supabase.rpc("stage_dgx_response", {
    p_family: family,
    p_key: key,
    p_body: body,
    p_as_of: asOf,
    p_min_interval_seconds: Math.round(refreshAfterMs / 1000),
  });
  if (error) {
    console.warn(`[staging] capture failed for ${family}/${key}: ${error.message}`);
    return;
  }
  // Noted whether or not the RPC decided to write: either way this instance
  // now knows a fresh-enough copy exists and need not ask again.
  noteCaptured(family, key);
}

function service() {
  try {
    return createServiceSupabase();
  } catch (err) {
    // No service key configured — staging is simply off. Say it once per
    // cold start rather than per request.
    if (!warnedNoService) {
      warnedNoService = true;
      console.warn(`[staging] capture disabled: ${(err as Error).message}`);
    }
    return null;
  }
}
let warnedNoService = false;

/**
 * Is this body worth storing as the answer to serve during an outage?
 *
 * Two ways a 200 is not one:
 *
 * 1. **It carries an error.** `/api/macro/gex`, `/api/macro/today`,
 *    `/api/macro/breadth` and `/api/macro/crypto-fear-greed` all answer 200
 *    with `{error: "..."}` when their upstream source is unavailable — the
 *    cards check exactly that field and render nothing. Storing one would
 *    not just be useless, it would OVERWRITE a good copy with a failure, so
 *    the next outage serves the failure. A 200 is not by itself an answer.
 *
 * 2. **It is empty.** `[]` or `{}` has nothing to give a reader and can only
 *    displace something that did. Note the narrowness: `{count: 0, rows: []}`
 *    IS kept, because "the screener found nothing today" is a real answer
 *    that DGX computed, not an absence of one.
 */
function worthKeeping(body: unknown): boolean {
  if (body === null || typeof body !== "object") return false;
  if (Array.isArray(body)) return body.length > 0;
  const obj = body as Record<string, unknown>;
  if (obj.error) return false;
  return Object.keys(obj).length > 0;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * The age of the DATA, where the payload says so.
 *
 * Most of these endpoints date themselves — `as_of`, `generated_at`,
 * `computed_at`, `updated_at` — and that timestamp is what the banner
 * should report, not when we happened to fetch it. Where there is none we
 * return null and the row falls back to now(), which OVER-states freshness
 * by at most the capture interval and never under-states age.
 *
 * A future timestamp is rejected rather than trusted: it would make the
 * banner read "0 minutes ago" for a copy of unknown vintage.
 */
function dataAsOf(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  for (const field of ["as_of", "generated_at", "computed_at", "updated_at"]) {
    const v = obj[field];
    if (typeof v !== "string") continue;
    const t = Date.parse(v);
    if (Number.isNaN(t) || t > Date.now() + 60_000) continue;
    return new Date(t).toISOString();
  }
  return null;
}
