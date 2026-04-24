/**
 * API client — all backend requests go through here.
 */
import axios, { AxiosInstance } from "axios";

// Use the env var if explicitly set (e.g. pointing to a remote server).
// Otherwise derive from the current page origin at runtime so the app works
// from any host — LAN, Tailscale, localhost — without rebuilding.
// nginx routes /api/* → api:8000, so the browser only needs to reach port 3000.
const BASE_URL: string = (() => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
})();

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
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
  refreshPrices: (tickers: string[]) =>
    api.post("/api/stocks/prices/batch", { tickers }).then((r) => r.data),
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

// ── OSINT ─────────────────────────────────────────────────────

export type OsintEvent = {
  id: string;
  event_type: string;
  event_code: string | null;
  urgency: "low" | "medium" | "high" | "critical";
  verification_level: string;
  country_code: string | null;
  location_name: string | null;
  location: { type: string; coordinates: [number, number] } | null;
  occurred_at: string | null;
  summary: string | null;
  tone: number | null;
  primary_article_url: string | null;
  article_count: number;
  actors: { id: string; kind: string; name: string; role: string }[];
};

export type OsintArticle = {
  content_hash: string;
  source: string;
  source_kind: string;
  title: string | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  language: string;
  event_id: string | null;
};

export type OsintIndex = {
  index_name: string;
  value: number;
  window_hours: number;
  as_of: string;
  components: Record<string, number>;
};

export const osintApi = {
  events: (params?: { event_type?: string; urgency?: string; country?: string; since_hours?: number; limit?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return api.get<OsintEvent[]>(`/api/osint/events?${p}`).then((r) => r.data);
  },
  event: (id: string) => api.get<OsintEvent>(`/api/osint/events/${id}`).then((r) => r.data),
  eventsForTicker: (ticker: string, since_hours = 48, limit = 30) =>
    api.get<OsintEvent[]>(`/api/osint/events/for-ticker/${ticker}?since_hours=${since_hours}&limit=${limit}`)
      .then((r) => r.data),
  timeline: (params?: { granularity?: "hour" | "day"; event_type?: string; actor?: string; since_hours?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return api.get<{ ts: string; event_type: string; count: number }[]>(`/api/osint/timeline?${p}`).then((r) => r.data);
  },
  map: (params?: { bbox?: string; event_type?: string; since_hours?: number; limit?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return api.get(`/api/osint/map?${p}`).then((r) => r.data);
  },
  actors: (params?: { kind?: string; q?: string; limit?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return api.get(`/api/osint/actors?${p}`).then((r) => r.data);
  },
  actor: (id: string) => api.get(`/api/osint/actors/${encodeURIComponent(id)}`).then((r) => r.data),
  indices: (params?: { names?: string; region?: string; window?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return api.get<OsintIndex[]>(`/api/osint/indices?${p}`).then((r) => r.data);
  },
  articles: (params?: { source_kind?: string; since_hours?: number; limit?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => v != null && p.set(k, String(v)));
    return api.get<OsintArticle[]>(`/api/osint/articles?${p}`).then((r) => r.data);
  },
};

// ── Backtest ──────────────────────────────────────────────────

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
  patterns: (ticker: string, period = "1y") =>
    api.get(`/api/scanner/patterns/${ticker}?period=${period}`).then((r) => r.data),
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

