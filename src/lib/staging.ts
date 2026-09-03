/**
 * The staging tier — reading DGX's per-ticker responses out of Supabase when
 * the box itself cannot answer.
 *
 * Two tables were mirrored into Supabase before this (stock_catalog and
 * llm_analysis), and through the 7h19m outage on 2026-08-25 they were the
 * only stock surfaces still serving: the watchlist and portfolio pages
 * rendered with prices up to an hour stale instead of breaking. This
 * generalises that to the per-ticker endpoints, which are the ones the edge
 * cache cannot help with — a ~400-name catalog is mostly cold, so a verdict
 * or a chain summary is almost never resident in the CDN at the moment it is
 * needed.
 *
 * The shared, precomputed families (macro, cross-sectional ranked, options
 * screener, multibagger candidates, fx, signals/today) were left out at
 * first, on the argument that they already carried
 * `s-maxage=300, stale-while-revalidate=86400, stale-if-error=86400` from the
 * middleware in backend/app/main.py and were hot enough for the edge to
 * hold them.
 *
 * That argument had a hole: those headers come FROM DGX. When the box is
 * unreachable the edge either has a resident copy or it has nothing, and
 * nothing is what the whole dashboard got. They are staged now too — see
 * the write-through tier at the bottom of this file, and PATH_FAMILIES in
 * src/lib/stagingPaths.ts. The edge is still the first tier, but Vercel is
 * now told what to hold by the proxy rather than by the origin, so the
 * instruction survives the origin.
 *
 * ── The rule for adding a family ──────────────────────────────────────────
 *
 * Everything staged here is SHARED, PUBLIC data — a verdict, a PAM read, a
 * chain summary, model output. Nothing user-scoped may be added: the read
 * below runs with the service-role key, which bypasses RLS, and a fallback
 * that returned one user's rows to another would be a far worse failure than
 * the outage it was covering. If a per-user endpoint ever needs staging, it
 * needs its own read path with the caller's session, not this one.
 */

import { createServiceSupabase } from "@/lib/supabase/service";
import {
  BATCH_FAMILIES,
  SEARCH_PATH,
  matchBatchRoute,
  matchPathFamily,
  captureKey,
  type BatchKind,
} from "@/lib/stagingPaths";

// Same shape src/lib/mcp/db.ts enforces, and now also the CHECK in
// supabase/018_enrichment_requests.sql: alphanumeric start, then [A-Z0-9.-].
const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

const DAY = 24 * 60 * 60 * 1000;

type Family = {
  /** Supabase table holding the staged response. */
  table: string;
  /** Column holding the response body. */
  column: string;
  /**
   * How old a staged copy may be and still be served. Past this the fallback
   * declines and the caller gets the real upstream failure, because a wrong
   * answer delivered confidently is worse than an outage the user can see.
   */
  maxAge: number;
  /** Human phrase for the banner. */
  label: string;
};

export const FAMILIES = {
  verdict: {
    table: "stock_verdict_snapshot",
    column: "verdict",
    // The verdict refresh runs weekdays at 23:55. A long weekend plus a
    // holiday is four days; ten leaves room for that without ever serving
    // something from a previous month.
    maxAge: 10 * DAY,
    label: "verdict",
  },
  priceAction: {
    table: "stock_price_action_snapshot",
    column: "price_action",
    // PAM is a weekly/monthly structural read by construction — its whole
    // premise is that the picture does not change intraday — so ten days of
    // staleness degrades it rather than invalidating it.
    maxAge: 10 * DAY,
    label: "price action",
  },
  optionSummary: {
    table: "stock_option_summary_snapshot",
    column: "summary",
    // The shortest window of any family, on purpose. An option chain from a
    // week ago read as current is not stale information, it is a wrong trade:
    // IV, open interest and max pain all move daily, and the income screener
    // preset filters on IV >= 60. Three days covers a weekend and stops.
    maxAge: 3 * DAY,
    label: "option chain",
  },
  modelResults: {
    table: "stock_model_results_snapshot",
    column: "results",
    // Model runs are daily-to-weekly per name and are explicitly timestamped
    // in the response the UI renders, so a fortnight is legible.
    maxAge: 14 * DAY,
    label: "model results",
  },
} as const satisfies Record<string, Family>;

export type FamilyKey = keyof typeof FAMILIES;

export type StagedHit = {
  /** The response body, already shaped like the endpoint's own output. */
  body: unknown;
  /** ISO timestamp of the DATA, not of the copy. */
  asOf: string;
  /**
   * Which family answered. `FamilyKey` for the DGX-written tables in 017,
   * otherwise the write-through family name — the value is only used for
   * logging, so it stays open rather than being a union nobody switches on.
   */
  familyKey: FamilyKey | "thoughts" | string;
  label: string;
};

/** Route table. Order matters only in that each pattern is distinct. */
const ROUTES: Array<{
  pattern: RegExp;
  resolve: (ticker: string) => Promise<StagedHit | null>;
}> = [
  {
    pattern: /^\/api\/stocks\/([^/]+)\/verdict$/,
    resolve: (t) => readSnapshot("verdict", t),
  },
  {
    pattern: /^\/api\/stocks\/([^/]+)\/price-action$/,
    resolve: (t) => readSnapshot("priceAction", t),
  },
  {
    pattern: /^\/api\/options\/([^/]+)\/summary$/,
    resolve: (t) => readSnapshot("optionSummary", t),
  },
  {
    pattern: /^\/api\/models\/([^/]+)\/results$/,
    resolve: (t) => readSnapshot("modelResults", t),
  },
  {
    // Thoughts get no snapshot table. llm_analysis has mirrored
    // thoughts_json / thoughts_summary / thoughts_generated_at since long
    // before this tier existed, and that is the entirety of what the
    // endpoint serves — a second copy would just be a third writer on the
    // same fact.
    pattern: /^\/api\/stocks\/([^/]+)\/thoughts$/,
    resolve: (t) => readThoughts(t),
  },
];

/**
 * Is there a staged answer for this path at all? Cheap, synchronous, no I/O —
 * the proxy uses it to decide whether a request is worth guarding with a
 * timeout before it makes the upstream call.
 */
export function hasStagedFallback(path: string): boolean {
  const clean = pathOnly(path);
  if (ROUTES.some((r) => r.pattern.test(clean))) return true;
  if (clean.toLowerCase() === SEARCH_PATH) return true;
  return matchPathFamily(path) !== null;
}

/**
 * Read the staged copy for a path, or null if there is none, the ticker is
 * implausible, the row is missing, or the row is past its serving window.
 *
 * Never throws: this runs on the failure path, and a fallback that throws
 * turns a recoverable 502 into an unhandled one.
 */
export async function readStaged(path: string): Promise<StagedHit | null> {
  const clean = pathOnly(path);
  for (const route of ROUTES) {
    const m = clean.match(route.pattern);
    if (!m) continue;
    try {
      // Already decoded, and deliberately not decoded again. The only caller
      // is src/app/api/[...path]/route.ts, which builds this path by joining
      // Next's `params.path` — and Next hands those segments over decoded. A
      // second decodeURIComponent would corrupt a symbol containing a literal
      // '%' and throws outright on a malformed escape ("/api/stocks/%zz/…"),
      // out of a function the proxy calls on its failure path. It also put
      // this in disagreement with hasStagedFallback above, which tests the
      // raw segment: the two could answer differently about the same path.
      const ticker = (m[1] ?? "").toUpperCase();
      if (!TICKER_RE.test(ticker)) return null;
      return await route.resolve(ticker);
    } catch (err) {
      console.error(`[staging] read failed for ${clean}:`, err);
      return null;
    }
  }

  try {
    // Search is answered from stock_catalog rather than from a captured
    // response: the query string is unbounded, so capturing per query would
    // store one row per thing anyone ever typed and still miss the next
    // one. The catalog is the same set of names the backend searches.
    if (clean.toLowerCase() === SEARCH_PATH) return await readCatalogSearch(path);
    return await readCapturedPath(path);
  } catch (err) {
    console.error(`[staging] read failed for ${clean}:`, err);
    return null;
  }
}

/**
 * Is this a batch read the proxy may answer from Supabase?
 *
 * POST is normally excluded from the fallback — a POST is a request to
 * change something and there is no honest stale version of that. These
 * three are the exception: they are reads whose argument (a list of up to
 * ~400 tickers) does not fit in a query string. Excluding them by method
 * alone is what left the watchlist's verdict and PAM columns empty during
 * an outage while the very same verdicts sat staged in Supabase.
 */
export function hasStagedBatchFallback(path: string): BatchKind | null {
  return matchBatchRoute(path);
}

/**
 * Answer a batch read from Supabase.
 *
 * Returns the map shape the endpoints return, containing only the tickers
 * that could be answered — a missing key and a null value mean the same
 * thing to every caller ("no badge"), and omitting is the smaller claim.
 *
 * Null when the request body is unreadable or nothing could be answered:
 * an empty map rendered as a successful response would present "the box is
 * down" as "none of these names has a verdict".
 */
export async function readStagedBatch(
  kind: BatchKind,
  requestBody: string,
): Promise<StagedHit | null> {
  const tickers = parseTickers(requestBody);
  if (!tickers.length) return null;
  try {
    return kind === "prices"
      ? await readCatalogPrices(tickers)
      : await readCapturedBatch(kind, tickers);
  } catch (err) {
    console.error(`[staging] batch read failed for ${kind}:`, err);
    return null;
  }
}

function parseTickers(requestBody: string): string[] {
  try {
    const parsed = JSON.parse(requestBody) as { tickers?: unknown };
    if (!Array.isArray(parsed?.tickers)) return [];
    return [
      ...new Set(
        parsed.tickers
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.toUpperCase())
          .filter((t) => TICKER_RE.test(t)),
      ),
    ];
  } catch {
    return [];
  }
}

function pathOnly(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

async function readSnapshot(
  familyKey: FamilyKey,
  ticker: string,
): Promise<StagedHit | null> {
  const family = FAMILIES[familyKey];
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from(family.table)
    .select(`${family.column}, as_of`)
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    console.error(`[staging] ${family.table} ${ticker}:`, error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const asOf = typeof row.as_of === "string" ? row.as_of : null;
  const body = row[family.column];
  if (!asOf || body === null || body === undefined) return null;
  if (!withinWindow(asOf, family.maxAge)) {
    console.warn(
      `[staging] ${family.table} ${ticker} is past its ${family.maxAge / DAY}d ` +
        `serving window (as_of ${asOf}) — declining to serve it`,
    );
    return null;
  }
  return { body, asOf, familyKey, label: family.label };
}

// Thoughts are regenerated weekly, and the sweep is rationed, so a name can
// legitimately sit three weeks between runs. The endpoint also returns
// generated_at in its own body, which the Thoughts card already displays.
const THOUGHTS_MAX_AGE = 30 * DAY;

async function readThoughts(ticker: string): Promise<StagedHit | null> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("llm_analysis")
    .select(
      "thoughts_json, thoughts_summary, thoughts_generated_at, " +
        "llm_intrinsic_value, llm_margin_of_safety",
    )
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    console.error(`[staging] llm_analysis ${ticker}:`, error.message);
    return null;
  }
  if (!data) return null;

  // Cast through unknown: the select list is a concatenated string, so
  // postgrest-js cannot infer the row shape from it.
  const row = data as unknown as {
    thoughts_json: unknown;
    thoughts_summary: string | null;
    thoughts_generated_at: string | null;
    llm_intrinsic_value: number | null;
    llm_margin_of_safety: number | null;
  };
  const asOf = row.thoughts_generated_at;
  if (!asOf || !withinWindow(asOf, THOUGHTS_MAX_AGE)) return null;

  const chosen = englishThoughts(row.thoughts_json);
  if (!chosen) return null;

  // Same body the DGX route builds in get_stock_thoughts.
  return {
    body: {
      ticker,
      locale: "en",
      locale_fallback: false,
      thoughts: chosen,
      summary: chosen.verdict ?? row.thoughts_summary,
      generated_at: asOf,
      llm_intrinsic_value: row.llm_intrinsic_value,
      llm_margin_of_safety: row.llm_margin_of_safety,
    },
    asOf,
    familyKey: "thoughts",
    label: "FinVibe's Thoughts",
  };
}

/**
 * Pull the English thoughts out of `thoughts_json`.
 *
 * The column still holds two historical shapes: a legacy flat blob (written
 * before the app carried a locale at all) and the bilingual `{en, zh?}`
 * wrapper from the period when it shipped a Chinese locale. Both have to be
 * read, so the unwrapping stays.
 *
 * What does NOT stay is the old "any locale is better than nothing" fallback.
 * The app has been English-only since the zh locale was dropped, and a name
 * whose row only ever got a `zh` blob would otherwise render a card of
 * Chinese prose during a DGX outage — the one moment nobody can regenerate
 * it. No English copy means no staged answer, and the caller sees the real
 * upstream failure instead.
 */
function englishThoughts(blob: unknown): Record<string, unknown> | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  const keys = Object.keys(obj);
  const isBilingual =
    keys.length > 0 &&
    keys.every((k) => k === "en" || k === "zh") &&
    keys.some((k) => obj[k] && typeof obj[k] === "object");
  const en = isBilingual ? obj.en : obj;
  return en && typeof en === "object" ? (en as Record<string, unknown>) : null;
}

function withinWindow(asOf: string, maxAge: number): boolean {
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAge;
}

// ── The write-through tier ─────────────────────────────────────────────
//
// Everything below reads rows that the proxy itself captured on the way
// past (src/lib/stagingCapture.ts), rather than rows a task on DGX pushed.
// The read is deliberately the same shape as the 017 one — body, as_of,
// window, label — so the proxy has a single notion of "a staged hit" and
// the banner does not have to learn where a copy came from.

/** A captured whole-response GET. */
async function readCapturedPath(path: string): Promise<StagedHit | null> {
  const family = matchPathFamily(path);
  if (!family) return null;
  const key = captureKey(path);
  if (!key) return null;

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("dgx_response_snapshot")
    .select("body, as_of")
    .eq("family", "path")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[staging] response snapshot ${key}:`, error.message);
    return null;
  }
  if (!data) return null;

  const row = data as { body: unknown; as_of: string | null };
  if (!row.as_of || row.body === null || row.body === undefined) return null;
  if (!withinWindow(row.as_of, family.maxAge)) {
    console.warn(
      `[staging] ${key} is past its ${family.maxAge / DAY}d serving window ` +
        `(as_of ${row.as_of}) — declining to serve it`,
    );
    return null;
  }
  return { body: row.body, asOf: row.as_of, familyKey: "path", label: family.label };
}

/**
 * A batch read, reassembled per ticker.
 *
 * Verdicts come from 017's DGX-written table first and fall back to the
 * captured copies, because the two can disagree: the table is refreshed
 * nightly for the whole catalog, the capture only for names someone has
 * looked at. Preferring the pushed copy means a name nobody opened this
 * week still answers with the same verdict the ranked book was built from.
 */
async function readCapturedBatch(
  kind: Exclude<BatchKind, "prices">,
  tickers: string[],
): Promise<StagedHit | null> {
  const spec = BATCH_FAMILIES[kind];
  const supabase = createServiceSupabase();
  const out: Record<string, unknown> = {};
  let oldest: string | null = null;

  const note = (asOf: string | null) => {
    if (!asOf) return;
    if (oldest === null || Date.parse(asOf) < Date.parse(oldest)) oldest = asOf;
  };

  if (kind === "verdict") {
    const { data, error } = await supabase
      .from("stock_verdict_snapshot")
      .select("ticker, verdict, as_of")
      .in("ticker", tickers);
    if (error) console.error(`[staging] verdict snapshot batch:`, error.message);
    for (const row of (data ?? []) as Array<{ ticker: string; verdict: unknown; as_of: string }>) {
      if (!withinWindow(row.as_of, spec.maxAge)) continue;
      out[row.ticker.toUpperCase()] = row.verdict;
      note(row.as_of);
    }
  }

  const missing = tickers.filter((t) => !(t in out));
  if (missing.length) {
    const { data, error } = await supabase
      .from("dgx_response_snapshot")
      .select("key, body, as_of")
      .eq("family", spec.family)
      .in("key", missing);
    if (error) {
      console.error(`[staging] ${spec.family} batch:`, error.message);
    }
    for (const row of (data ?? []) as Array<{ key: string; body: unknown; as_of: string }>) {
      if (!withinWindow(row.as_of, spec.maxAge)) continue;
      out[row.key.toUpperCase()] = row.body;
      note(row.as_of);
    }
  }

  if (!Object.keys(out).length || !oldest) return null;
  // The OLDEST entry, not the newest: the banner is a claim about the whole
  // response, and the whole response is only as fresh as its stalest part.
  return { body: out, asOf: oldest, familyKey: spec.family, label: spec.label };
}

/**
 * Prices, from the catalog mirror rather than from a capture.
 *
 * stock_catalog.last_price is already what the watchlist and portfolio rows
 * render — DGX keeps it current, and it survives an outage by construction.
 * Serving the batch endpoint from it means the "live price" overlay and the
 * row underneath it agree during an outage instead of the overlay silently
 * vanishing, and the banner now says which it is.
 */
async function readCatalogPrices(tickers: string[]): Promise<StagedHit | null> {
  const spec = BATCH_FAMILIES.prices;
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("stock_catalog")
    .select("ticker, last_price, last_price_updated_at")
    .in("ticker", tickers);

  if (error) {
    console.error("[staging] catalog prices:", error.message);
    return null;
  }

  const rows = (data ?? []) as Array<{
    ticker: string;
    last_price: number | null;
    last_price_updated_at: string | null;
  }>;

  const body: Array<{ ticker: string; price: number | null; as_of: string | null }> = [];
  let oldest: string | null = null;
  for (const r of rows) {
    if (r.last_price == null) continue;
    // A price with no timestamp cannot be aged, and an unageable price is
    // exactly the one that should not be presented as current.
    if (!r.last_price_updated_at) continue;
    if (!withinWindow(r.last_price_updated_at, spec.maxAge)) continue;
    body.push({
      ticker: r.ticker.toUpperCase(),
      price: r.last_price,
      as_of: r.last_price_updated_at,
    });
    if (oldest === null || Date.parse(r.last_price_updated_at) < Date.parse(oldest)) {
      oldest = r.last_price_updated_at;
    }
  }

  if (!body.length || !oldest) return null;
  return { body, asOf: oldest, familyKey: spec.family, label: spec.label };
}

/**
 * Search, from the catalog.
 *
 * Narrower than the live endpoint — it can only find names already in the
 * catalog, so an outage means you cannot look up something FinVibe has
 * never seen. It can still find the ~400 it has, which is what "add the
 * thing I was reading about" needs on the watchlist and portfolio pages,
 * and those were completely blocked before.
 */
const SEARCH_LIMIT = 20;

const MARKET_SUFFIXES: Record<string, string[]> = {
  HK: [".HK"],
  CN: [".SS", ".SZ"],
  SG: [".SI"],
};

async function readCatalogSearch(path: string): Promise<StagedHit | null> {
  const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));
  const q = (params.get("q") ?? "").trim();
  if (!q) return null;
  const market = (params.get("market") ?? "").toUpperCase();

  const supabase = createServiceSupabase();
  // PostgREST `or` takes a comma-separated filter list, and a comma or a
  // parenthesis inside the pattern would break out of it — so the query is
  // stripped to what a ticker or a company name can contain. `%` goes too:
  // it is the wildcard, and leaving it in lets a query match everything.
  const safe = q.replace(/[^A-Za-z0-9 .-]/g, "");
  if (!safe) return null;
  const { data, error } = await supabase
    .from("stock_catalog")
    .select("ticker, name, sector, industry, last_price, last_price_updated_at")
    .or(`ticker.ilike.%${safe}%,name.ilike.%${safe}%`)
    .limit(SEARCH_LIMIT * 3);

  if (error) {
    console.error("[staging] catalog search:", error.message);
    return null;
  }

  const rows = (data ?? []) as Array<{
    ticker: string;
    name: string | null;
    sector: string | null;
    industry: string | null;
    last_price: number | null;
    last_price_updated_at: string | null;
  }>;

  const suffixes = MARKET_SUFFIXES[market];
  const filtered = rows.filter((r) => {
    const t = r.ticker.toUpperCase();
    if (!market || market === "ALL") return true;
    if (suffixes) return suffixes.some((s) => t.endsWith(s));
    // US is "has no foreign suffix" — the same rule inferCurrency uses.
    if (market === "US") return !/\.[A-Z]{1,2}$/.test(t);
    return true;
  });

  if (!filtered.length) return null;

  // Exact ticker first, then prefix, then everything else — the live
  // endpoint ranks the same way and typing "NV" should not bury NVDA.
  const upper = q.toUpperCase();
  filtered.sort((a, b) => rank(a.ticker, upper) - rank(b.ticker, upper));

  const newest = filtered.reduce<string | null>((acc, r) => {
    const t = r.last_price_updated_at;
    if (!t) return acc;
    return acc === null || Date.parse(t) > Date.parse(acc) ? t : acc;
  }, null);

  return {
    body: filtered.slice(0, SEARCH_LIMIT).map((r) => ({
      ticker: r.ticker.toUpperCase(),
      name: r.name ?? r.ticker,
      sector: r.sector ?? undefined,
      industry: r.industry ?? undefined,
      price: r.last_price ?? undefined,
      current_price: r.last_price ?? undefined,
    })),
    // The catalog's own last movement. Not "now" — that would claim a
    // freshness the mirror does not have during an outage.
    asOf: newest ?? new Date().toISOString(),
    familyKey: "search",
    label: "stock search",
  };
}

function rank(ticker: string, q: string): number {
  const t = ticker.toUpperCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  return 2;
}
