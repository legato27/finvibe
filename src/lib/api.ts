/**
 * API client — all backend requests go through here.
 */
import axios, { AxiosInstance } from "axios";
import { noteFresh, noteStale } from "@/lib/staleness";

// Use the env var ONLY if it is a well-formed absolute http(s) URL (e.g. a
// remote server for self-hosted/LAN/Tailscale deploys). A bare host like
// "api.vibelife.sg" (no scheme) is a misconfiguration — and on Vercel pointing
// the browser at the Cloudflare-Access-gated backend directly always 403s since
// the browser has no service token. In that case fall back to the page origin
// so requests go same-origin through the server-side proxy (which holds the
// CF-Access token). nginx/Vercel route /api/* → backend.
const BASE_URL: string = (() => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
})();

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// The app is English-only — tell the backend so LLM-generated text comes back
// in English.
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  (config.headers as Record<string, string>)["Accept-Language"] = "en";
  return config;
});

// Catch responses the proxy answered from the Supabase staging tier. Those
// carry X-FinVibe-Stale and are otherwise byte-identical to a live response,
// which is what lets every component keep working through a DGX outage — and
// also what would let a three-day-old option chain render as if it were live
// if nobody said so. StaleDataBanner reads this store.
//
// Same-origin, so the custom header is readable without an
// Access-Control-Expose-Headers dance. When NEXT_PUBLIC_API_URL points at a
// remote backend the requests bypass the proxy entirely and there is no
// fallback to report — the header is simply absent and nothing marks stale.
api.interceptors.response.use((response) => {
  const asOf = response.headers?.["x-finvibe-stale"];
  const url = response.config?.url ?? "";
  if (typeof asOf === "string" && asOf) {
    const family = response.headers?.["x-finvibe-stale-family"];
    noteStale(url, asOf, typeof family === "string" ? family : "data");
  } else if (url) {
    noteFresh(url);
  }
  return response;
});

// ── Watchlist ─────────────────────────────────────────────────

export const watchlistApi = {
  list: () => api.get("/api/watchlist/").then((r) => r.data),
  add: (ticker: string) => api.post("/api/watchlist/add", { ticker }).then((r) => r.data),
  remove: (ticker: string) => api.delete(`/api/watchlist/${ticker}`).then((r) => r.data),
  get: (ticker: string) => api.get(`/api/watchlist/${ticker}`).then((r) => r.data),
};

// ── Stocks ────────────────────────────────────────────────────

export const stocksApi = {
  search: (q: string, market?: string) => {
    const params = new URLSearchParams({ q });
    if (market) params.set("market", market);
    return api.get(`/api/stocks/search?${params.toString()}`).then((r) => r.data);
  },
  info: (ticker: string) => api.get(`/api/stocks/${ticker}/info`).then((r) => r.data),
  detail: (ticker: string) => api.get(`/api/stocks/${ticker}/detail`).then((r) => r.data),
  thoughts: (ticker: string) => api.get(`/api/stocks/${ticker}/thoughts`).then((r) => r.data),
  generateThoughts: (ticker: string) => api.post(`/api/stocks/${ticker}/generate-thoughts`).then((r) => r.data),
  priceHistory: (ticker: string, period = "1y", interval = "1d") =>
    api.get(`/api/stocks/${ticker}/price-history?period=${period}&interval=${interval}`).then((r) => r.data),
  priceAction: (ticker: string) =>
    api.get(`/api/stocks/${ticker}/price-action`).then((r) => r.data),
  // Backend caps /prices/batch at 100 tickers — chunk so large lists (e.g. the
  // ~140-name ranked book) don't 400 and wipe out the whole price overlay.
  refreshPrices: async (tickers: string[]) => {
    if (!tickers?.length) return [];
    const CHUNK = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < tickers.length; i += CHUNK) chunks.push(tickers.slice(i, i + CHUNK));
    const results = await Promise.all(
      chunks.map((c) => api.post("/api/stocks/prices/batch", { tickers: c }).then((r) => r.data)),
    );
    return results.flat();
  },
  pamBatch: (tickers: string[]) =>
    api.post("/api/stocks/pam/batch", { tickers }).then((r) => r.data),
  verdict: (ticker: string) =>
    api.get(`/api/stocks/${ticker}/verdict`).then((r) => r.data),
  signalsToday: () => api.get("/api/stocks/signals/today").then((r) => r.data),
  // (ranked-book honesty stat lives on modelsApi.rankedBookPerformance)
  verdictBatch: (tickers: string[]) =>
    api.post("/api/stocks/verdict/batch", { tickers }).then((r) => r.data),
  events: (ticker: string) => api.get(`/api/stocks/${ticker}/events`).then((r) => r.data),
  optionsInference: (ticker: string, body: Record<string, unknown>) =>
    api.post(`/api/stocks/${ticker}/options-inference`, body).then((r) => r.data),
  optionsStrategyRecommendation: (ticker: string, body: Record<string, unknown>) =>
    api
      .post(`/api/stocks/${ticker}/options-strategy-recommendation`, body, { timeout: 120_000 })
      .then((r) => r.data),
  positionAdvice: (ticker: string, body: Record<string, unknown>) =>
    api.post(`/api/stocks/${ticker}/position-advice`, body).then((r) => r.data),
};

// ── Options chain (real Polygon chain data, 15-min delayed) ─────────────────

export const optionsApi = {
  expiries: (ticker: string) =>
    api.get(`/api/options/${ticker}/expiries`).then((r) => r.data),
  chain: (ticker: string, expiry?: string, strikes = 24) => {
    const params = new URLSearchParams({ strikes: String(strikes) });
    if (expiry) params.set("expiry", expiry);
    return api.get(`/api/options/${ticker}/chain?${params.toString()}`).then((r) => r.data);
  },
  summary: (ticker: string) =>
    api.get(`/api/options/${ticker}/summary`).then((r) => r.data),
  screener: () => api.get("/api/options/screener").then((r) => r.data),
  // The option desk: short-put / covered-call candidates that have been scored
  // rather than hard-filtered. Two hard gates only (solvency, liquidity);
  // everything else is weighted, and names that fail a gate come back in the
  // `rejected` tier WITH the reason instead of being dropped — an empty screen
  // teaches the trader nothing about why it is empty.
  desk: (
    strategy: "csp" | "covered_call" = "csp",
    limit = 120,
    opts?: { collateral?: number; maxNamePct?: number; maxBucketPct?: number; maxPositions?: number },
  ) => {
    const p = new URLSearchParams({ strategy, limit: String(limit) });
    // Collateral turns the ranking into a sized book. Omitted, the desk is a
    // ranking only — which is the honest default, since a book depends on cash
    // the desk cannot know.
    if (opts?.collateral) p.set("collateral", String(opts.collateral));
    if (opts?.maxNamePct) p.set("max_name_pct", String(opts.maxNamePct));
    if (opts?.maxBucketPct) p.set("max_bucket_pct", String(opts.maxBucketPct));
    if (opts?.maxPositions) p.set("max_positions", String(opts.maxPositions));
    return api.get(`/api/options/desk?${p.toString()}`).then((r) => r.data);
  },
  // Tier-1 assignment backtest — path facts from five years of daily candles.
  // No option prices, so no P&L: assignment rate, touch rate, how deep it went,
  // whether the assigned shares recovered.
  assignmentBacktest: (dte = 30, delta = 0.25, type: "put" | "call" = "put") =>
    api
      .get(`/api/options/backtest/assignment?dte=${dte}&delta=${delta}&type=${type}`, {
        timeout: 120_000,
      })
      .then((r) => r.data),
  // Timestamped log of the ranked-book strategy for this name — one entry per
  // change. Feeds the "Strategy log" section in the stock-detail Options tab.
  strategyLog: (ticker: string, limit = 30) =>
    api.get(`/api/options/${ticker}/strategy-log?limit=${limit}`).then((r) => r.data),
};

// ── FX ───────────────────────────────────────────────────────

export type FxRatesResponse = {
  base: string;
  as_of: string;
  rates: Record<string, number>;
};

export const fxApi = {
  rates: (base = "USD") =>
    api.get<FxRatesResponse>(`/api/fx/rates?base=${encodeURIComponent(base)}`).then((r) => r.data),
};

// ── Portfolio Analysis (Claude / Gemma) ──────────────────────

export type PortfolioAnalysisBody = {
  holdings: Array<{
    ticker: string;
    name?: string;
    sector?: string;
    shares: number;
    cost_basis: number;
    current_price?: number;
    mkt_value: number;
    weight_pct: number;
  }>;
  total_value: number;
  portfolio_name?: string;
};

export type StructuredAnalysis = {
  summary_headline: string;
  risk_dashboard: Array<{
    metric: string;
    value: string;
    severity: "normal" | "elevated" | "high" | "critical";
    note?: string;
  }>;
  position_risks: Array<{
    ticker: string;
    beta?: number | null;
    ann_vol_pct?: number | null;
    max_drawdown_pct?: number | null;
    notes?: string;
  }>;
  portfolio_risks: Array<{
    title: string;
    severity: "normal" | "elevated" | "high" | "critical";
    detail: string;
  }>;
  stress_test: Array<{
    scenario: string;
    portfolio_return_pct?: number | null;
    spy_return_pct?: number | null;
    interpretation?: string;
  }>;
  hedges: Array<{ strategy: string; rationale: string; sizing?: string }>;
  verdict: string;
};

export type PortfolioAnalysisResponse = {
  analysis: string;
  structured: StructuredAnalysis | null;
  risk_context?: unknown;
  model: string;
  prompt: string;
};

export const portfolioAnalysisApi = {
  claude: (body: PortfolioAnalysisBody) =>
    api
      .post<PortfolioAnalysisResponse>("/api/portfolio/analyze/claude", body, { timeout: 220_000 })
      .then((r) => r.data),
  gemma: (body: PortfolioAnalysisBody) =>
    api
      .post<PortfolioAnalysisResponse>("/api/portfolio/analyze/gemma", body, { timeout: 220_000 })
      .then((r) => r.data),
};

// ── Quant Models ──────────────────────────────────────────────

export const modelsApi = {
  run: (ticker: string, modelType: string) =>
    api.post(`/api/models/${ticker}/run`, { model_type: modelType }).then((r) => r.data),
  runAll: (ticker: string) => api.get(`/api/models/${ticker}/run/all`).then((r) => r.data),
  results: (ticker: string) => api.get(`/api/models/${ticker}/results`).then((r) => r.data),
  taskStatus: (taskId: string) => api.get(`/api/models/tasks/${taskId}/status`).then((r) => r.data),
  lastRun: (ticker: string) => api.get(`/api/models/${ticker}/last-run`).then((r) => r.data),
  crossSectional: () => api.get(`/api/models/cross-sectional/ranked`).then((r) => r.data),
  rankedBookPerformance: () => api.get(`/api/models/ranked-book/performance`).then((r) => r.data),
  optionsRanked: () => api.get(`/api/models/options-ranked`).then((r) => r.data),
  optionsRecoScorecard: (window = 60) =>
    api.get(`/api/models/options-reco/scorecard?window=${window}`).then((r) => r.data),
  optionsRecoOpen: () => api.get(`/api/models/options-reco/open`).then((r) => r.data),
};

// ── Scheduled jobs (status page) ──────────────────────────────

export const jobsApi = {
  status: () => api.get("/api/jobs/status").then((r) => r.data),
  rerun: (taskName: string) =>
    api.post(`/api/jobs/${encodeURIComponent(taskName)}/rerun`).then((r) => r.data),
};

// ── Macro ─────────────────────────────────────────────────────

export const macroApi = {
  vix: () => api.get("/api/macro/vix").then((r) => r.data),
  vixTermStructure: () => api.get("/api/macro/vix-term-structure").then((r) => r.data),
  businessCycle: () => api.get("/api/macro/business-cycle").then((r) => r.data),
  sectorRotation: () => api.get("/api/macro/sector-rotation").then((r) => r.data),
  swarm: () => api.get("/api/macro/swarm").then((r) => r.data),
  breadth: () => api.get("/api/macro/breadth").then((r) => r.data),
  gex: () => api.get("/api/macro/gex").then((r) => r.data),
  regimeSectors: () => api.get("/api/macro/regime-sectors").then((r) => r.data),
  today: () => api.get("/api/macro/today").then((r) => r.data),
  cryptoFearGreed: () => api.get("/api/macro/crypto-fear-greed").then((r) => r.data),
  macroTape: () => api.get("/api/macro/macro-tape").then((r) => r.data),
  dashboard: () => api.get("/api/macro/dashboard", { timeout: 90_000 }).then((r) => r.data),
};

// ── Sentiment ─────────────────────────────────────────────────

export const sentimentApi = {
  newsFeed: (limit = 50, tickers?: string[], sourceKind?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (tickers?.length) params.set("tickers", tickers.join(","));
    if (sourceKind) params.set("source_kind", sourceKind);
    return api.get(`/api/sentiment/news-feed?${params}`).then((r) => r.data);
  },
  ticker: (ticker: string) => api.get(`/api/sentiment/${ticker}`).then((r) => r.data),
  category: (category: string, window = 60) =>
    api.get(`/api/sentiment/category/${category}?window=${window}`).then((r) => r.data),
  categoryWindows: (category: string) =>
    api.get(`/api/sentiment/category/${category}/windows`).then((r) => r.data),
  tickerBuzz: (ticker: string) =>
    api.get(`/api/sentiment/ticker-buzz/${ticker}`).then((r) => r.data),
  finnhub: (category: string) =>
    api.get(`/api/sentiment/finnhub/${category}`).then((r) => r.data),
};


export const backtestApi = {
  run: (ticker: string, body: { timeframe?: string; strategies?: string[] }) =>
    api.post(`/api/backtest/${ticker}/run`, body).then((r) => r.data),
  results: (ticker: string, timeframe = "1d") =>
    api.get(`/api/backtest/${ticker}/results?timeframe=${timeframe}`).then((r) => r.data),
  taskStatus: (taskId: string) =>
    api.get(`/api/backtest/tasks/${taskId}/status`).then((r) => r.data),
};

// ── Backtest Watchlist (AI Backtesting) ──────────────────────

export const backtestWatchlistApi = {
  // Watchlist
  list: () =>
    api.get("/api/backtest-watchlist/").then((r) => r.data),
  addTicker: (ticker: string) =>
    api.post("/api/backtest-watchlist/add", { ticker }).then((r) => r.data),
  removeTicker: (ticker: string) =>
    api.delete(`/api/backtest-watchlist/${ticker}`).then((r) => r.data),

  // Strategies
  strategies: () =>
    api.get("/api/backtest-watchlist/strategies").then((r) => r.data),

  // Experiments
  experiments: () =>
    api.get("/api/backtest-watchlist/experiments").then((r) => r.data),
  experimentDetail: (id: string | number) =>
    api.get(`/api/backtest-watchlist/experiments/${id}`).then((r) => r.data),
  runManual: (body: { hypothesis: string; changes: Record<string, unknown>; comment?: string; timeframes?: string[]; strategy_version?: number }) =>
    api.post("/api/backtest-watchlist/experiments/run-manual", body).then((r) => r.data),
  purgeExperiments: () =>
    api.post("/api/backtest-watchlist/experiments/purge").then((r) => r.data),
  strategyHistory: (code: string) =>
    api.get(`/api/backtest-watchlist/strategies/${code}/history`).then((r) => r.data),

  // Autoresearch
  autoresearchStart: (maxExperiments: number, timeframes?: string[], comment?: string) =>
    api.post("/api/backtest-watchlist/autoresearch/start", { max_experiments: maxExperiments, timeframes, comment }).then((r) => r.data),
  autoresearchStop: () =>
    api.post("/api/backtest-watchlist/autoresearch/stop").then((r) => r.data),
  autoresearchStatus: (category?: string) =>
    api.get(`/api/backtest-watchlist/autoresearch/status${category ? `?category=${category}` : ""}`).then((r) => r.data),

  // Leaderboard
  leaderboard: (category?: string) =>
    api.get(`/api/backtest-watchlist/leaderboard${category ? `?category=${category}` : ""}`).then((r) => r.data),

  // Favourites
  favourites: () =>
    api.get("/api/backtest-watchlist/favourites").then((r) => r.data),
  toggleFavourite: (id: number, is_favourite: boolean, label?: string) =>
    api.post(`/api/backtest-watchlist/experiments/${id}/favourite`, { is_favourite, label }).then((r) => r.data),

  // Search
  searchExperiments: (q: string) =>
    api.get(`/api/backtest-watchlist/experiments/search?q=${encodeURIComponent(q)}`).then((r) => r.data),

  // LLM Explain
  explainExperiment: (id: number) =>
    api.post(`/api/backtest-watchlist/experiments/${id}/explain`).then((r) => r.data),

  // Re-run
  rerunExperiment: (id: number, tickers?: string[]) =>
    api.post(`/api/backtest-watchlist/experiments/${id}/rerun`, { tickers }).then((r) => r.data),

  // Promote experiment to active strategy version
  promoteExperiment: (id: number, category: string = "swing") =>
    api.post(`/api/backtest-watchlist/experiments/${id}/promote`, { category }).then((r) => r.data),
};

// ── Scanner ──────────────────────────────────────────────────

export const scannerApi = {
  sectors: () => api.get("/api/scanner/sectors").then((r) => r.data),
  holdings: (etf: string) => api.get(`/api/scanner/holdings/${etf}`).then((r) => r.data),
  scan: (etf: string) =>
    api.get(`/api/scanner/scan/${etf}`, { timeout: 120_000 }).then((r) => r.data),
  // ── Multibagger (two-track full-market scanner) ──────────────
  multibaggerCandidates: (track: "all" | "A" | "B" = "all") =>
    api.get(`/api/scanner/multibagger/candidates?track=${track}`).then((r) => r.data),
  multibaggerRegime: () =>
    api.get("/api/scanner/multibagger/regime").then((r) => r.data),
  multibaggerScan: () =>
    api.get("/api/scanner/multibagger/scan?refresh=true", { timeout: 300_000 }).then((r) => r.data),
  multibaggerPerformance: () =>
    api.get("/api/scanner/multibagger/performance").then((r) => r.data),
};

// ── BTC Market Maker ─────────────────────────────────────────

export const btcMMApi = {
  getPrice: () => api.get("/api/btc/price").then((r) => r.data),
  getOHLCV: (timeframe = "4h", limit = 100) =>
    api.get(`/api/btc/ohlcv?timeframe=${timeframe}&limit=${limit}`).then((r) => r.data),
  getLiquidityMap: (timeframe = "4h") =>
    api.get(`/api/btc/liquidity-map?timeframe=${timeframe}`).then((r) => r.data),
  getSession: () => api.get("/api/btc/session").then((r) => r.data),
  getMMSetup: (timeframe = "4h") =>
    api.get(`/api/btc/mm-setup?timeframe=${timeframe}`).then((r) => r.data),
  // Backtest
  runBacktest: (timeframe = "4h", lookback = 500, minConfidence = 50) =>
    api.post(`/api/btc/backtest/run?timeframe=${timeframe}&lookback=${lookback}&min_confidence=${minConfidence}`).then((r) => r.data),
  backtestTaskStatus: (taskId: string) =>
    api.get(`/api/btc/backtest/tasks/${taskId}/status`).then((r) => r.data),
  backtestResults: (timeframe = "4h") =>
    api.get(`/api/btc/backtest/results?timeframe=${timeframe}`).then((r) => r.data),
};

export default api;

