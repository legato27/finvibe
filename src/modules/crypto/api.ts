/**
 * Crypto module client for the box's /api/crypto-desk routes, through the
 * app's proxy. Its own axios instance, so the shared client is untouched.
 */
import axios from "axios";

const api = axios.create({ timeout: 30_000, headers: { "Content-Type": "application/json", "Accept-Language": "en" } });

export type CoinTicker = { symbol: string; price: number | null; change_24h_pct: number | null; high_24h: number | null; low_24h: number | null; volume_24h: number | null };
export type CoinTickers = { as_of: string; source: string; tickers: Record<string, CoinTicker>; missing: string[] };
export type Session = { utc_now: string; active_session: { name: string; ends_in_minutes?: number; description?: string } | null; next_session: { name: string; starts_in_minutes: number } | null; all_sessions: Array<{ name: string; start_utc: string; end_utc: string; description: string }> };
export type Setup = { setup_type: string; confidence: number; bias: string; entry_zone: { low: number; high: number } | null; stop_level: number | null; target_1: number | null; target_2: number | null; invalidation: number | null; reasoning: string; error?: string };
export type Liquidity = {
  price_data: { current_price: number; change_24h_pct: number; high_24h: number; low_24h: number; volume_24h: number };
  liquidity_pools: Array<{ price: number; type: string; strength: number; touches: number }>;
  order_blocks: Array<{ price?: number; low?: number; high?: number; type: string; strength?: number; timestamp?: string }>;
  fvgs: Array<{ low: number; high: number; type: string; filled?: boolean; timestamp?: string }>;
  premium_discount: Record<string, unknown>;
  session: Session; mm_setup: Setup; generated_at: string | null; stale?: boolean; error?: string;
};
export type Reading = { available: boolean; reading: string; price: { current_price?: number; change_24h_pct?: number; high_24h?: number; low_24h?: number; volume_24h?: number }; session: Session; setup: Setup | null; premium_discount: Record<string, unknown> | null; counts?: { liquidity_pools: number; order_blocks: number; fvgs: number }; as_of: string; error?: string };
export type Backtest = { timeframe: string; run_at: string | null; summary?: Record<string, unknown> | null; setup_stats?: Record<string, unknown> | null; lookback?: number; min_confidence?: number; trade_count?: number; result?: null; error?: string };

export const cryptoApi = {
  tickers: (symbols: string[]) =>
    api.get(`/api/crypto-desk/coins/ticker?symbols=${encodeURIComponent(symbols.join(","))}`).then((r) => r.data as CoinTickers),
  candles: (symbol: string, interval = "1d", limit = 180) =>
    api.get(`/api/crypto-desk/coins/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`).then((r) => r.data),
  session: () => api.get("/api/crypto-desk/btc/session").then((r) => r.data as Session),
  setup: (timeframe = "4h") => api.get(`/api/crypto-desk/btc/setup?timeframe=${timeframe}`).then((r) => r.data as Setup),
  liquidity: (timeframe = "4h") => api.get(`/api/crypto-desk/btc/liquidity?timeframe=${timeframe}`, { timeout: 90_000 }).then((r) => r.data as Liquidity),
  backtest: (timeframe = "4h") => api.get(`/api/crypto-desk/btc/backtest?timeframe=${timeframe}`).then((r) => r.data as Backtest),
  reading: (timeframe = "4h") => api.get(`/api/crypto-desk/btc/reading?timeframe=${timeframe}`, { timeout: 90_000 }).then((r) => r.data as Reading),
};
