// Server-side fetches against the DGX market-data backend.
// Mirrors a slice of src/lib/api.ts but runs from server routes
// (and re-uses the same Cloudflare Access service-token plumbing
// that src/lib/proxy.ts uses).

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

async function dgxJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!DGX_API_URL) throw new Error("DGX_API_URL is not set");
  const res = await fetch(`${DGX_API_URL}${path}`, {
    ...init,
    headers: dgxHeaders(init?.headers as Record<string, string> | undefined),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DGX ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
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
  // News + sentiment (sentiment_cache ∪ osint_articles on DGX).
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
  osintEvents: (ticker: string, sinceHours?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (sinceHours) params.set("since_hours", String(sinceHours));
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return dgxJson<unknown>(
      `/api/osint/events/for-ticker/${encodeURIComponent(ticker)}${qs ? `?${qs}` : ""}`,
    );
  },
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
  enrich: (ticker: string) =>
    dgxJson<unknown>(
      `/api/watchlist/enrich`,
      { method: "POST", body: JSON.stringify({ ticker }) },
    ),
};

// Request enrichment for a set of tickers. One idempotent call per ticker;
// errors are swallowed so one slow/broken ticker doesn't block the others.
export async function enrichTickers(tickers: string[]): Promise<void> {
  if (!tickers.length) return;
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  await Promise.allSettled(
    unique.map((ticker) =>
      market.enrich(ticker).catch((err) => {
        console.error(`[mcp enrich] enrich ${ticker} failed`, err);
      }),
    ),
  );
}
