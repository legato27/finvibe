// Server-side fetches against the DGX market-data backend.
// Mirrors a slice of src/lib/api.ts but runs from server routes
// (and re-uses the same Cloudflare Access service-token plumbing
// that src/lib/proxy.ts uses).
//
// ── Why this file also carries the staging tier ────────────────────────
//
// It re-used the proxy's AUTH plumbing and none of its resilience. The
// browser goes through src/lib/proxy.ts and gets the edge cache, the
// write-through capture and the Supabase fallback; the MCP server called
// DGX directly from here and got none of it. Same repo, same deployment,
// same 17 tools reading the very endpoints whose staged copies were
// sitting in Supabase — and all of them died with the box.
//
// So dgxJson now does what proxyToDgx does: capture reads on the way past,
// serve the staged copy when the box cannot answer.
//
// ── One difference, and it matters ─────────────────────────────────────
//
// The browser has StaleDataBanner. An MCP client has nothing — the caller
// is a model, and a staged option chain rendered as a plain result is one
// it will read as live and may act on. So on the degraded path ONLY, the
// payload is wrapped: `{_stale: {...}, data: ...}`, with a notice written
// to be read by the thing that will read it. Live responses keep their
// exact shape.

import { pooledMap } from "@/lib/util/pool";
import { after } from "next/server";
import {
  hasStagedBatchFallback,
  hasStagedFallback,
  readStaged,
  readStagedBatch,
  type StagedHit,
} from "@/lib/staging";
import { capturePathResponse, captureBatchResponse } from "@/lib/stagingCapture";
import { matchPathFamily, stagedTimeoutMs } from "@/lib/stagingPaths";

const DGX_API_URL = process.env.DGX_API_URL;
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

function dgxHeaders(extra?: Record<string, string>): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
  if (CF_ACCESS_CLIENT_ID) h["CF-Access-Client-Id"] = CF_ACCESS_CLIENT_ID;
  if (CF_ACCESS_CLIENT_SECRET) h["CF-Access-Client-Secret"] = CF_ACCESS_CLIENT_SECRET;
  return h;
}

/**
 * Wrap a staged body so the caller cannot mistake it for live data.
 *
 * Deliberately a shape change, unlike the browser fallback which is
 * byte-identical on purpose. There the transparency is the point, because a
 * banner says the rest; here there is no banner and the reader is a model,
 * so the notice has to travel inside the payload it is about.
 */
function stale<T>(hit: StagedHit): T {
  return {
    _stale: {
      as_of: hit.asOf,
      source: "supabase-snapshot",
      family: hit.label,
      notice:
        `FinVibe's analysis backend is unreachable. This is a STORED COPY of the ` +
        `${hit.label} from ${hit.asOf}, not live market data. Say so before using ` +
        `it, and do not act on it as a current quote, chain or signal.`,
    },
    data: hit.body,
  } as T;
}

/** Fire-and-forget, whether or not a request scope is available. */
function inBackground(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    // `after` throws outside a request context (a script, a test). The work
    // is optional either way, so run it detached rather than losing it.
    void work().catch(() => {});
  }
}

async function dgxJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  // Writes are excluded exactly as they are in the proxy: generate-thoughts,
  // run/all and enrich are requests to change something on the box, and
  // there is no honest stale version of that. They simply throw.
  const batchKind = method === "POST" ? hasStagedBatchFallback(path) : null;
  const canFallBack = (method === "GET" && hasStagedFallback(path)) || batchKind !== null;
  const requestBody = typeof init?.body === "string" ? init.body : "";

  const staged = async (): Promise<StagedHit | null> => {
    if (batchKind) return readStagedBatch(batchKind, requestBody);
    return canFallBack ? readStaged(path) : null;
  };

  if (!DGX_API_URL) {
    const hit = await staged();
    if (hit) return stale<T>(hit);
    throw new Error("DGX_API_URL is not set");
  }

  let res: Response;
  try {
    res = await fetch(`${DGX_API_URL}${path}`, {
      ...init,
      headers: dgxHeaders(init?.headers as Record<string, string> | undefined),
      // Only where there is something to fall back to, and never over a
      // signal the caller set itself — the webhook receiver passes its own
      // deadline so it keeps enough budget to release its claim.
      ...(canFallBack && !init?.signal
        ? { signal: AbortSignal.timeout(stagedTimeoutMs(path)) }
        : {}),
    });
  } catch (err) {
    const hit = await staged();
    if (hit) return stale<T>(hit);
    throw err;
  }

  if (!res.ok) {
    // 5xx only — a 404 is DGX answering "no such name", and papering over it
    // with a snapshot would resurrect data the backend stopped serving.
    if (res.status >= 500 && canFallBack) {
      const hit = await staged();
      if (hit) return stale<T>(hit);
    }
    const body = await res.text().catch(() => "");
    throw new Error(`DGX ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const raw = await res.text();

  // Warm the same cache the browser fills. An MCP session that reads a name
  // is as good a reason to hold a copy of it as a page view.
  if (method === "GET" && matchPathFamily(path)) {
    inBackground(() => capturePathResponse(path, raw));
  } else if (batchKind && batchKind !== "prices") {
    inBackground(() => captureBatchResponse(batchKind, raw));
  }

  return JSON.parse(raw) as T;
}

export const market = {
  search: (q: string, marketCode?: string) => {
    const params = new URLSearchParams({ q });
    if (marketCode) params.set("market", marketCode);
    return dgxJson<unknown>(`/api/stocks/search?${params.toString()}`);
  },
  info: (ticker: string) =>
    dgxJson<unknown>(`/api/stocks/${encodeURIComponent(ticker)}/info`),
  // Returns the full record including stock_catalog fields (name, sector,
  // moat, intrinsic_value, margin_of_safety, trends, enrichment_status)
  // AND a nested `llm` object with the LLM-derived analysis. Strict superset
  // of /info — prefer this when populating Supabase.
  detail: (ticker: string) =>
    dgxJson<unknown>(`/api/stocks/${encodeURIComponent(ticker)}/detail`),
  refreshPrices: (tickers: string[]) =>
    dgxJson<unknown>(`/api/stocks/prices/batch`, {
      method: "POST",
      body: JSON.stringify({ tickers }),
    }),
  // Daily OHLCV history. period is constrained by DGX to
  // 1mo|3mo|6mo|1y|2y|5y|10y (10y is the max available).
  priceHistory: (ticker: string, period = "1y", interval = "1d") =>
    dgxJson<unknown>(
      `/api/stocks/${encodeURIComponent(ticker)}/price-history` +
        `?period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`,
    ),
  // Top-down PAM price-action read: daily/weekly/monthly structure (UC/DC/
  // UR/DR), setup variant, sweet-spot zone, FSB trigger, divergence. Served
  // from the DGX nightly blob (Redis → persisted → live compute on miss).
  priceAction: (ticker: string) =>
    dgxJson<unknown>(`/api/stocks/${encodeURIComponent(ticker)}/price-action`),
  // Unified, conflict-aware verdict from the verdict engine (nightly blob).
  verdict: (ticker: string) =>
    dgxJson<unknown>(`/api/stocks/${encodeURIComponent(ticker)}/verdict`),
  // Options (Polygon chain data, 15-min delayed).
  optionExpiries: (ticker: string) =>
    dgxJson<unknown>(`/api/options/${encodeURIComponent(ticker)}/expiries`),
  optionChain: (ticker: string, expiry?: string, strikes?: number) => {
    const params = new URLSearchParams();
    if (expiry) params.set("expiry", expiry);
    if (strikes) params.set("strikes", String(strikes));
    const qs = params.toString();
    return dgxJson<unknown>(
      `/api/options/${encodeURIComponent(ticker)}/chain${qs ? `?${qs}` : ""}`,
    );
  },
  optionsSummary: (ticker: string) =>
    dgxJson<unknown>(`/api/options/${encodeURIComponent(ticker)}/summary`),
  // Watchlist-wide options screener: persisted daily summaries, no live fetches.
  optionsScreener: () => dgxJson<unknown>(`/api/options/screener`),
  // Watchlist digest: new PAM triggers, verdict state changes, conflicts.
  signalsToday: () => dgxJson<unknown>(`/api/stocks/signals/today`),
  // Latest cached multibagger scan; track filters A (confirmed) / B (early).
  multibaggerCandidates: (track?: "all" | "A" | "B") =>
    dgxJson<unknown>(
      `/api/scanner/multibagger/candidates?track=${encodeURIComponent(track ?? "all")}`,
    ),
  // Synthesized macro decision surface — regime, risk score, positioning.
  macroToday: () => dgxJson<unknown>(`/api/macro/today`),
  fxRates: (base?: string) =>
    dgxJson<unknown>(
      `/api/fx/rates?base=${encodeURIComponent((base ?? "USD").toUpperCase())}`,
    ),
  // News + sentiment (sentiment_cache on DGX).
  newsFeed: (tickers?: string[], limit?: number, sourceKind?: string) => {
    const params = new URLSearchParams();
    if (tickers?.length)
      params.set("tickers", tickers.map((t) => t.toUpperCase()).join(","));
    if (limit) params.set("limit", String(limit));
    if (sourceKind) params.set("source_kind", sourceKind);
    const qs = params.toString();
    return dgxJson<unknown>(`/api/sentiment/news-feed${qs ? `?${qs}` : ""}`);
  },
  tickerSentiment: (ticker: string) =>
    dgxJson<unknown>(`/api/sentiment/${encodeURIComponent(ticker)}`),
  generateThoughts: (ticker: string) =>
    dgxJson<unknown>(
      `/api/stocks/${encodeURIComponent(ticker)}/generate-thoughts`,
      { method: "POST" },
    ),
  runAllModels: (ticker: string) =>
    dgxJson<unknown>(
      `/api/models/${encodeURIComponent(ticker)}/run/all`,
      { method: "GET" },
    ),
  // Idempotent enrichment kick. DGX ensures its local row, runs the full
  // pipeline (prices → financials → moat → DCF → ETF → trends → LLM metadata →
  // thoughts/models) and is the SOLE writer of the Supabase stock_catalog /
  // llm_analysis mirror. The web/MCP clients only request enrichment here; they
  // do not write detail fields or enrichment_status themselves.
  // `timeoutMs` matters on the one caller that runs inside a serverless
  // function with a deadline (the Supabase webhook receiver, which must keep
  // enough budget to release its claim if this call does not come back).
  // Everything else leaves it unset and keeps the old unbounded wait.
  enrich: (ticker: string, timeoutMs?: number) =>
    dgxJson<unknown>(
      `/api/watchlist/enrich`,
      {
        method: "POST",
        body: JSON.stringify({ ticker }),
        ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      },
    ),
};

// Request enrichment for a set of tickers. One idempotent call per ticker;
// errors are swallowed so one slow/broken ticker doesn't block the others.
export async function enrichTickers(tickers: string[]): Promise<void> {
  if (!tickers.length) return;
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  // Cap in-flight enrich requests so a big watchlist/sweep doesn't fire one
  // HTTP call per ticker at once (DGX dedupes per ticker on its side too).
  await pooledMap(unique, 5, (ticker) =>
    market.enrich(ticker).catch((err) => {
      console.error(`[mcp enrich] enrich ${ticker} failed`, err);
    }),
  );
}
