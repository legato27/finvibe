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
 * screener, multibagger candidates, fx, signals/today) are deliberately
 * absent. They already carry
 * `s-maxage=300, stale-while-revalidate=86400, stale-if-error=86400` from the
 * middleware in backend/app/main.py and they are hot enough for that to work.
 * Staging them too would be a third copy of the same fact.
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
  familyKey: FamilyKey | "thoughts";
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
  return ROUTES.some((r) => r.pattern.test(clean));
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
    const ticker = decodeURIComponent(m[1] ?? "").toUpperCase();
    if (!TICKER_RE.test(ticker)) return null;
    try {
      return await route.resolve(ticker);
    } catch (err) {
      console.error(`[staging] read failed for ${clean}:`, err);
      return null;
    }
  }
  return null;
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

  const { chosen, wasFallback } = resolveThoughtsLocale(row.thoughts_json, "en");
  if (!chosen) return null;

  // Same body the DGX route builds in get_stock_thoughts.
  return {
    body: {
      ticker,
      locale: "en",
      locale_fallback: wasFallback,
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
 * Mirror of resolve_thoughts_for_locale / normalize_bilingual_thoughts in
 * backend/app/services/analytics/llm_stock_analyst.py. thoughts_json is
 * either the bilingual shape {en, zh?} or a legacy flat blob, which that code
 * treats as English.
 *
 * The one behaviour deliberately NOT mirrored is the backfill: the live route
 * queues a task when a locale is missing. This path runs precisely when the
 * box that would run that task is unreachable, so there is nothing to queue.
 */
function resolveThoughtsLocale(
  blob: unknown,
  locale: string,
): { chosen: Record<string, unknown> | null; wasFallback: boolean } {
  if (!blob || typeof blob !== "object") return { chosen: null, wasFallback: false };
  const obj = blob as Record<string, unknown>;
  const keys = Object.keys(obj);
  const isBilingual =
    keys.length > 0 &&
    keys.every((k) => k === "en" || k === "zh") &&
    keys.some((k) => obj[k] && typeof obj[k] === "object");
  const bilingual = isBilingual ? obj : { en: obj };

  const pick = (k: string) => {
    const v = bilingual[k];
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  };

  const exact = pick(locale);
  if (exact) return { chosen: exact, wasFallback: false };
  const en = pick("en");
  if (en) return { chosen: en, wasFallback: true };
  for (const k of Object.keys(bilingual)) {
    const v = pick(k);
    if (v) return { chosen: v, wasFallback: true };
  }
  return { chosen: null, wasFallback: false };
}

function withinWindow(asOf: string, maxAge: number): boolean {
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAge;
}
