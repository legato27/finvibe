/**
 * The allowlist — which DGX responses may be captured, how long a captured
 * copy may be served, and what the edge is allowed to hold.
 *
 * This is the single source of truth for three things that must agree, and
 * that were previously spread across a Python task on DGX, a table in
 * Supabase and a route table on Vercel:
 *
 *   1. what the proxy writes through to Supabase on a successful response
 *   2. what the proxy is willing to serve back when the box is unreachable
 *   3. what Cache-Control the proxy puts on the response for the CDN
 *
 * ── The allowlist is a security boundary, not a convenience ───────────
 *
 * A captured row is served to WHOEVER asks for that path next, from a table
 * read with the service-role key. That is correct for a verdict and
 * catastrophic for a watchlist. So this list is closed by default: a path
 * that matches nothing here is never captured, never served stale, and
 * never given a public Cache-Control — it just fails, which is the honest
 * outcome for anything user-scoped.
 *
 * Everything below is shared, public market data with no user in it.
 * `assertShareable()` re-checks that at capture time against the known
 * user-scoped prefixes, so adding a pattern that overlaps one of them fails
 * loudly instead of leaking quietly.
 *
 * ── Choosing a window ─────────────────────────────────────────────────
 *
 * `maxAge` is "how long can this be wrong by before showing it does more
 * harm than showing nothing". It is not a cache TTL and it is not uniform:
 * an option chain from last week is a wrong trade, an FX rate from last
 * week is a rounding error, a multibagger scan from last week is the same
 * scan. Past the window the fallback declines and the caller gets the real
 * upstream failure.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Default patience on the tunnel for a path that has something to fall back
 * to. A dead origin behind Cloudflare usually 502s promptly, but a
 * half-open connection can hang until the function's own maxDuration, and a
 * fallback that only fires after a minute of spinner is not a fallback
 * anyone experiences.
 */
export const DEFAULT_STAGED_TIMEOUT_MS = 20_000;

export type PathFamily = {
  /** Matched against the pathname only, lowercased. */
  pattern: RegExp;
  /** Human phrase for the staleness banner. */
  label: string;
  /** How old a captured copy may be and still be served. */
  maxAge: number;
  /**
   * Minimum gap between captures of the same key. The hot endpoints are on
   * a 60s poll and change far more slowly than that; without this every
   * dashboard tick would be a Supabase write.
   */
  refreshAfter: number;
  /**
   * What the CDN may hold. Only set where a shared copy served to another
   * user would be correct — which is everything in this file, but it is
   * stated per family so that stays a decision rather than a default.
   *
   * `stale-while-revalidate` is the half that survives an outage: once
   * s-maxage lapses the edge serves its copy and revalidates behind the
   * request, and a revalidation against a dead origin leaves the stored
   * copy in place. That is a second, independent tier in front of the
   * Supabase one — and unlike the previous arrangement it is set HERE,
   * rather than forwarded from a header the box has to be alive to send.
   */
  sMaxAge: number;
  /**
   * How long to wait on the tunnel for THIS family before giving up and
   * serving the staged copy. Omitted means the proxy's default (20s).
   *
   * Set it only where a healthy response legitimately takes longer than
   * that. Staging a path used to be free of this decision because an
   * unstaged path had no timeout at all; now that the dashboard and the
   * desk are staged, a blanket 20s would abandon requests that were about
   * to succeed and serve yesterday's copy instead — a fallback firing on a
   * working box is worse than no fallback.
   */
  timeoutMs?: number;
};

/**
 * Ordered; first match wins. Specific patterns must precede general ones —
 * `/api/options/{t}/chain` before the `/api/options/{t}/…` catch-alls.
 */
export const PATH_FAMILIES: PathFamily[] = [
  // ── Macro & the dashboard ────────────────────────────────────────────
  // Every card on the logged-in home page comes from here. Cheap to hold,
  // and a day-old macro read is still the same regime — that is the whole
  // premise of a regime read.
  {
    // First, and separately, because it fans out across every macro source
    // on the box and routinely takes tens of seconds when healthy — the
    // client allows it 90. It must precede the generic macro pattern.
    pattern: /^\/api\/macro\/dashboard$/,
    label: "macro",
    maxAge: 3 * DAY,
    refreshAfter: 5 * MINUTE,
    sMaxAge: 300,
    timeoutMs: 45_000,
  },
  {
    pattern: /^\/api\/macro\/[a-z0-9-]+$/,
    label: "macro",
    maxAge: 3 * DAY,
    refreshAfter: 10 * MINUTE,
    sMaxAge: 300,
  },
  {
    // Crypto trades through the weekend, so it goes wrong faster than the
    // equity macro tape it sits next to.
    pattern: /^\/api\/crypto\/[a-z0-9-]+$/,
    label: "crypto",
    maxAge: 1 * DAY,
    refreshAfter: 10 * MINUTE,
    sMaxAge: 300,
  },
  {
    pattern: /^\/api\/stocks\/signals\/today$/,
    label: "today's signals",
    maxAge: 3 * DAY,
    refreshAfter: 10 * MINUTE,
    sMaxAge: 300,
  },

  // ── Ranked book & screeners ──────────────────────────────────────────
  {
    pattern: /^\/api\/models\/(cross-sectional\/ranked|ranked-book\/performance|options-ranked)$/,
    label: "ranked book",
    maxAge: 10 * DAY,
    refreshAfter: 30 * MINUTE,
    sMaxAge: 600,
  },
  {
    pattern: /^\/api\/models\/options-reco\/(scorecard|open)$/,
    label: "recommendation track record",
    maxAge: 14 * DAY,
    refreshAfter: 30 * MINUTE,
    sMaxAge: 600,
  },
  {
    // Chain-derived, so it inherits the option chain's short window: the
    // desk ranks on IV and premium, both of which move daily.
    pattern: /^\/api\/options\/(screener|desk)$/,
    label: "option desk",
    maxAge: 3 * DAY,
    refreshAfter: 30 * MINUTE,
    sMaxAge: 600,
    // The desk scores a 400-name book and sizes it; the client allows 120s.
    timeoutMs: 45_000,
  },
  {
    // Five years of daily candles, recomputed occasionally — path facts,
    // not prices. Stale barely means anything here.
    pattern: /^\/api\/options\/backtest\/assignment$/,
    label: "assignment backtest",
    maxAge: 30 * DAY,
    refreshAfter: 6 * HOUR,
    sMaxAge: 3600,
    // Five years of candles per name; the client allows 120s.
    timeoutMs: 45_000,
  },
  {
    pattern: /^\/api\/scanner\/multibagger\/(candidates|regime|performance)$/,
    label: "multibagger scan",
    maxAge: 14 * DAY,
    refreshAfter: 1 * HOUR,
    sMaxAge: 900,
  },

  // ── FX ───────────────────────────────────────────────────────────────
  {
    // Staged mainly so the portfolio stops summing mixed currencies. A
    // week-old rate is off by well under a percent on the majors — far
    // closer to right than the 1:1 the page used to fall back to.
    pattern: /^\/api\/fx\/rates$/,
    label: "FX rates",
    maxAge: 7 * DAY,
    refreshAfter: 30 * MINUTE,
    sMaxAge: 900,
  },

  // ── Per-ticker: the ones 017 does not already cover ──────────────────
  {
    // THE one that mattered most. The stock page returns "not found" when
    // this is missing, which took every staged family on that page down
    // with it — verdict, thoughts, models, chain summary, all present in
    // Supabase and all unreachable behind a failed /detail.
    pattern: /^\/api\/stocks\/[^/]+\/(detail|info)$/,
    label: "stock detail",
    maxAge: 10 * DAY,
    refreshAfter: 1 * HOUR,
    sMaxAge: 300,
  },
  {
    pattern: /^\/api\/stocks\/[^/]+\/price-history$/,
    label: "price history",
    maxAge: 10 * DAY,
    refreshAfter: 1 * HOUR,
    sMaxAge: 300,
  },
  {
    // Earnings dates age badly in one specific way: a past date read as
    // upcoming. A week keeps that to at most one missed print.
    pattern: /^\/api\/stocks\/[^/]+\/events$/,
    label: "events",
    maxAge: 7 * DAY,
    refreshAfter: 6 * HOUR,
    sMaxAge: 900,
  },
  {
    pattern: /^\/api\/options\/[^/]+\/(chain|expiries)$/,
    label: "option chain",
    maxAge: 3 * DAY,
    refreshAfter: 1 * HOUR,
    sMaxAge: 300,
  },
  {
    pattern: /^\/api\/options\/[^/]+\/strategy-log$/,
    label: "strategy log",
    maxAge: 14 * DAY,
    refreshAfter: 6 * HOUR,
    sMaxAge: 900,
  },
  {
    pattern: /^\/api\/models\/[^/]+\/last-run$/,
    label: "model results",
    maxAge: 14 * DAY,
    refreshAfter: 6 * HOUR,
    sMaxAge: 900,
  },
  {
    pattern: /^\/api\/sentiment\/(news-feed|[^/]+|category\/[^/]+(\/windows)?|ticker-buzz\/[^/]+|finnhub\/[^/]+)$/,
    label: "news & sentiment",
    maxAge: 3 * DAY,
    refreshAfter: 30 * MINUTE,
    sMaxAge: 300,
  },
];

/**
 * Never capture, never serve stale, never mark public — whatever else
 * matches. These are the paths whose response depends on WHO asked.
 *
 * /api/jobs is not user-scoped but is deliberately here too: a staged
 * job-status page during an outage would show yesterday's runs all green,
 * which is precisely the wrong answer to "is the box alive". An empty
 * status page is the honest one.
 */
const NEVER_STAGE = [
  "/api/watchlist",
  "/api/backtest-watchlist",
  "/api/portfolio",
  "/api/enrich",
  "/api/mcp",
  "/api/settings",
  "/api/auth",
  "/api/hooks",
  "/api/jobs",
];

export function isNeverStaged(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return NEVER_STAGE.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** The family for a path, or null if it is not on the allowlist. */
export function matchPathFamily(path: string): PathFamily | null {
  const pathname = pathOnly(path).toLowerCase();
  if (isNeverStaged(pathname)) return null;
  return PATH_FAMILIES.find((f) => f.pattern.test(pathname)) ?? null;
}

/**
 * The storage key for a request.
 *
 * The pathname is upper-cased so /api/stocks/nvda/detail and
 * /api/stocks/NVDA/detail are one row rather than two — the only thing that
 * ever differs by case in these paths is the ticker. Query parameters are
 * sorted so `?a=1&b=2` and `?b=2&a=1` agree, and `refresh` is dropped
 * because it asks the backend to recompute rather than describing what is
 * being asked for.
 *
 * Returns null for a key longer than the index can usefully hold; such a
 * request simply is not captured.
 */
const MAX_KEY_LENGTH = 300;

export function captureKey(path: string): string | null {
  const q = path.indexOf("?");
  const pathname = (q === -1 ? path : path.slice(0, q)).toUpperCase();
  let key = pathname;
  if (q !== -1) {
    const params = new URLSearchParams(path.slice(q + 1));
    params.delete("refresh");
    const pairs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (pairs.length) {
      key += `?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}`;
    }
  }
  return key.length > MAX_KEY_LENGTH ? null : key;
}

export function pathOnly(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

/**
 * Belt and braces on the allowlist: refuse to capture anything sitting
 * under a user-scoped prefix even if a pattern above were widened to cover
 * it. Cheap, and the failure it guards against is one user's data served to
 * another.
 */
export function assertShareable(path: string): boolean {
  return !isNeverStaged(pathOnly(path).toLowerCase());
}

// ── Batch routes ───────────────────────────────────────────────────────
//
// Three POSTs carry the columns of the watchlist and the ranked book.
// `proxyToDgx` will not fall back on a POST in general — a POST is a
// request to change something and there is no honest stale version of that
// — but these three are reads that happen to take a list too long for a
// query string, and they are the reason the staged verdict and price-action
// tables sat unused while the columns they feed rendered empty.
//
// They are handled per ticker rather than per request: the response is a
// map, so a capture of {A,B,C} answers a later request for {B,C,D} in part.

export const BATCH_PRICES = "/api/stocks/prices/batch";
export const BATCH_VERDICT = "/api/stocks/verdict/batch";
export const BATCH_PAM = "/api/stocks/pam/batch";

export type BatchKind = "prices" | "verdict" | "pam";

export function matchBatchRoute(path: string): BatchKind | null {
  switch (pathOnly(path).toLowerCase()) {
    case BATCH_PRICES:
      return "prices";
    case BATCH_VERDICT:
      return "verdict";
    case BATCH_PAM:
      return "pam";
    default:
      return null;
  }
}

export const BATCH_FAMILIES: Record<
  BatchKind,
  {
    family: string;
    label: string;
    maxAge: number;
    refreshAfter: number;
    timeoutMs: number;
  }
> = {
  // Prices are never captured — stock_catalog.last_price is already the
  // mirror DGX keeps current, and it is the same number the watchlist row
  // itself renders. A second copy would be a third writer on one fact.
  //
  // The longest patience of the three, and the reason this field exists at
  // all: these routes had NO timeout before they had a fallback, and this
  // one goes to a live quote provider for up to 100 names a chunk. 28s sits
  // just inside the client's own 30s budget — late enough not to abandon a
  // call that was about to succeed, early enough that the staged answer
  // still beats the browser giving up.
  prices: {
    family: "price-batch",
    label: "prices",
    maxAge: 5 * DAY,
    refreshAfter: 0,
    timeoutMs: 28_000,
  },
  // Ten days, matching 017's verdict window: the refresh runs weekdays at
  // 23:55, so a long weekend plus a holiday still lands inside it. Both of
  // these read precomputed JSON rather than computing anything, so the
  // default patience is right.
  verdict: {
    family: "verdict-batch",
    label: "verdict",
    maxAge: 10 * DAY,
    refreshAfter: 30 * MINUTE,
    timeoutMs: DEFAULT_STAGED_TIMEOUT_MS,
  },
  // PAM is a weekly/monthly structural read by construction — its premise
  // is that the picture does not move intraday.
  pam: {
    family: "pam-batch",
    label: "price action",
    maxAge: 10 * DAY,
    refreshAfter: 30 * MINUTE,
    timeoutMs: DEFAULT_STAGED_TIMEOUT_MS,
  },
};

/** GET /api/stocks/search — answered from stock_catalog, not from a capture. */
export const SEARCH_PATH = "/api/stocks/search";

/**
 * How long to wait on the tunnel for this request. Every value stays well
 * inside the route's `maxDuration` of 60s, because the fallback read still
 * has to happen after the wait gives up.
 */
export function stagedTimeoutMs(path: string): number {
  const batch = matchBatchRoute(path);
  if (batch) return BATCH_FAMILIES[batch].timeoutMs;
  return matchPathFamily(path)?.timeoutMs ?? DEFAULT_STAGED_TIMEOUT_MS;
}
