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

// ── Scalp family (phase 4 desk integration) ──
export type ScalpCondition = { name: string; ok: boolean; detail: string };
export type ScalpRow = {
  symbol: string; setup: "A" | "B" | "C"; side: "long" | "short" | null; status: "fired" | "unlogged" | "near" | "far"; met: number; total: number;
  conditions: ScalpCondition[]; gates: { passed: boolean; failed: string[] }; edge_bps: number | null; round_trip_bps: number | null;
  confidence: number | null; levels: { entry?: number; invalidation?: number; target?: number; anchor?: string; time_stop_min?: number; size_hint?: number; tranches?: number[] } | null;
  price: number | null; spread_bps: number | null; regime: { pam_1h: string | null; pam_4h: string | null; btc_trend_1h: string | null }; session: string; ts: number; score: number;
};
export type ScalpRisk = {
  state: "active" | "paused" | "halted"; reason: string | null; since: string | null; by: string | null; trading_allowed: boolean; as_of: string;
  budgets: { sleeve_nav_usd: number; risk_per_trade_usd: number; max_daily_loss_r: number; max_trades_per_day: number; max_consecutive_losses: number };
  today: { trades_used: number; trades_remaining: number; realised_r: number; daily_loss_used_r: number; daily_loss_remaining_r: number; consecutive_losses: number; open_signals: number };
};
export type ScalpSignal = {
  id: number; signal_id: string; symbol: string; setup: string; strategy: string; side: string; mode: string; made_at: string | null;
  entry_px: number | null; invalidation_px: number | null; target_px: number | null; r_planned: number | null; time_stop_at: string | null;
  session: string | null; confidence: number | null; p_win_assumed: number | null; packet_id: string | null; resolved_at: string | null;
  outcome: string | null; r_realised: number | null; exit_px: number | null; mfe_r: number | null; mae_r: number | null; reason: string | null;
  // Execution, from the paper broker: the resting limit, its fill bar, the bar that closed it, and the journal row.
  execution: "pending" | "filled" | "closed" | "unfilled"; fill_at: string | null; exit_at: string | null; exit_reason: string | null;
  journal_trade_id: number | null;
};
export type ScalpDesk = {
  as_of: string | null; symbols: number; count: number; tiers: { fired: number; unlogged: number; near: number; far: number };
  gates: Record<string, string>; risk: ScalpRisk; active_signals: ScalpSignal[]; rows: ScalpRow[];
};
export type CryptoToday = {
  as_of: string; majors: Array<{ symbol: string; price: number | null; as_of?: string; pam_1h?: string | null; pam_4h?: string | null; btc_trend_1h?: string | null; funding_regime?: string | null; oi_regime?: string | null; funding_z?: number | null; oi_delta_1h?: number | null }>;
  funding_regime: string | null; oi_regime: string | null; btc_trend_1h: string | null; liq_burst_minutes_24h: number;
  active_signals: ScalpSignal[]; signals_today: number; paper_realised_r_today: number; risk: ScalpRisk;
};
export type CryptoScorecardBlock = {
  n: number; n_signals: number; fill_rate: number | null; win_rate: number | null; avg_r: number | null; median_r: number | null; avg_pnl_pct: number | null;
  target_rate: number | null; stop_rate: number | null; time_stop_rate: number | null; mean_p_win_assumed: number | null; calibration_gap: number | null; avg_mfe_r: number | null; avg_mae_r: number | null;
};
export type CryptoScorecard = {
  window_days: number; asset_class: "crypto"; mode: string; coverage: Record<string, unknown>; overall: CryptoScorecardBlock;
  by_strategy: Record<string, CryptoScorecardBlock>; by_session: Record<string, CryptoScorecardBlock>; by_symbol: Record<string, CryptoScorecardBlock>; by_side: Record<string, CryptoScorecardBlock>;
  // setup A by the order flow behind its trigger: "scalp_A/strong_flow" | "scalp_A/weak_flow" (absent on older backends)
  by_trigger?: Record<string, CryptoScorecardBlock>;
};

export const cryptoApi = {
  today: () => api.get("/api/crypto-desk/today").then((r) => r.data as CryptoToday),
  scalpDesk: (symbol?: string) => api.get(`/api/crypto-desk/scalp/desk${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`, { timeout: 60_000 }).then((r) => r.data as ScalpDesk),
  signals: (status: "active" | "today" | "recent" = "active", limit = 50) => api.get(`/api/crypto-desk/signals?status=${status}&limit=${limit}`).then((r) => r.data as { status: string; count: number; signals: ScalpSignal[] }),
  riskStatus: () => api.get("/api/crypto-desk/risk/status").then((r) => r.data as ScalpRisk),
  halt: (reason: string) => api.post("/api/crypto-desk/risk/halt", { reason, by: "web" }).then((r) => r.data as ScalpRisk),
  resume: () => api.post("/api/crypto-desk/risk/resume", { by: "web" }).then((r) => r.data as ScalpRisk),
  scorecard: (window = 400, mode = "paper") => api.get(`/api/models/options-reco/scorecard?window=${window}&asset_class=crypto&mode=${mode}`).then((r) => r.data as CryptoScorecard),
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
