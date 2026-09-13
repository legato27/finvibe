// Single source of truth for MCP tool documentation.
// Both src/lib/mcp/tools.ts (server registration) and src/app/mcp/page.tsx
// (public docs page) read from this catalog so descriptions and parameters
// stay in sync.

export interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ToolDoc {
  name: string;
  title: string;
  description: string;
  params: ToolParam[];
  returns: string;
  group: ToolGroup;
}

export type ToolGroup =
  | "Profile"
  | "Watchlists"
  | "Portfolios"
  | "Holdings"
  | "Sales"
  | "Market data"
  | "Options"
  | "News & sentiment"
  | "AI"
  | "Today"
  | "Quant"
  | "Desk"
  | "Journal"
  | "Crypto";

export const TOOL_CATALOG: ToolDoc[] = [
  // ── Profile ──────────────────────────────────────────────
  {
    name: "get_profile",
    group: "Profile",
    title: "Get user profile",
    description:
      "Return the signed-in user's profile (default currency, display name, email).",
    params: [],
    returns: "Profile object: { id, email, display_name, default_currency }",
  },

  // ── Watchlists ───────────────────────────────────────────
  {
    name: "list_watchlists",
    group: "Watchlists",
    title: "List watchlists",
    description: "List all of the user's watchlists with their stocks.",
    params: [],
    returns:
      "Array of watchlist objects, each with nested watchlist_items and stock_catalog rows.",
  },
  {
    name: "create_watchlist",
    group: "Watchlists",
    title: "Create a watchlist",
    description: "Create a new watchlist.",
    params: [
      { name: "name", type: "string", required: true, description: "Watchlist name." },
      { name: "description", type: "string", required: false },
    ],
    returns: "The created watchlist row.",
  },
  {
    name: "delete_watchlist",
    group: "Watchlists",
    title: "Delete a watchlist",
    description: "Delete a watchlist and all of its items.",
    params: [
      { name: "watchlist_id", type: "integer", required: true },
    ],
    returns: "{ deleted: true, watchlist_id }",
  },
  {
    name: "add_to_watchlist",
    group: "Watchlists",
    title: "Add a stock to a watchlist",
    description:
      "Add a ticker to one of the user's watchlists. Creates the stock_catalog entry if it doesn't already exist.",
    params: [
      { name: "watchlist_id", type: "integer", required: true },
      { name: "ticker", type: "string", required: true, description: "Ticker symbol, e.g. AAPL." },
    ],
    returns: "{ watchlist_id, ticker, stock_id }",
  },
  {
    name: "remove_from_watchlist",
    group: "Watchlists",
    title: "Remove a stock from a watchlist",
    description: "Remove a ticker from one of the user's watchlists.",
    params: [
      { name: "watchlist_id", type: "integer", required: true },
      { name: "ticker", type: "string", required: true },
    ],
    returns: "{ removed: <count>, watchlist_id, ticker }",
  },

  // ── Portfolios ───────────────────────────────────────────
  {
    name: "list_portfolios",
    group: "Portfolios",
    title: "List portfolios",
    description:
      "List all of the user's portfolios (containers only — no holdings included).",
    params: [],
    returns: "Array of portfolio objects.",
  },
  {
    name: "get_portfolio",
    group: "Portfolios",
    title: "Get a portfolio with holdings and totals",
    description:
      "Return a portfolio with its holdings, current prices, market value, weights, " +
      "and unrealized P&L.",
    params: [
      { name: "portfolio_id", type: "integer", required: true },
    ],
    returns:
      "{ portfolio, holdings: [...with name, sector, current_price, mkt_value, " +
      "cost_value, unrealized_pnl, weight_pct], totals: { value, cost, " +
      "unrealized_pnl, lot_count } }",
  },
  {
    name: "create_portfolio",
    group: "Portfolios",
    title: "Create a portfolio",
    description: "Create a new (empty) portfolio.",
    params: [
      { name: "name", type: "string", required: true },
      { name: "description", type: "string", required: false },
    ],
    returns: "The created portfolio row.",
  },
  {
    name: "delete_portfolio",
    group: "Portfolios",
    title: "Delete a portfolio",
    description:
      "Delete a portfolio and all of its holdings and sales (cascade).",
    params: [
      { name: "portfolio_id", type: "integer", required: true },
    ],
    returns: "{ deleted: true, portfolio_id }",
  },

  // ── Holdings ─────────────────────────────────────────────
  {
    name: "add_holding",
    group: "Holdings",
    title: "Add a holding (buy lot)",
    description:
      "Record a buy lot in a portfolio. cost_basis is the per-share cost, " +
      "shares is the lot size.",
    params: [
      { name: "portfolio_id", type: "integer", required: true },
      { name: "ticker", type: "string", required: true },
      { name: "shares", type: "number", required: true },
      { name: "cost_basis", type: "number", required: true, description: "Per-share cost." },
      { name: "acquired_date", type: "string", required: false, description: "ISO date (YYYY-MM-DD)." },
      { name: "broker", type: "string", required: false },
      { name: "notes", type: "string", required: false },
      { name: "currency", type: "string (ISO 4217)", required: false, description: "Defaults to USD." },
    ],
    returns: "The created holding row.",
  },
  {
    name: "update_holding",
    group: "Holdings",
    title: "Update a holding",
    description:
      "Patch fields on an existing buy lot. Only provided fields are changed.",
    params: [
      { name: "holding_id", type: "integer", required: true },
      { name: "shares", type: "number", required: false },
      { name: "cost_basis", type: "number", required: false },
      { name: "acquired_date", type: "string | null", required: false },
      { name: "broker", type: "string | null", required: false },
      { name: "notes", type: "string | null", required: false },
    ],
    returns: "The updated holding row.",
  },
  {
    name: "delete_holding",
    group: "Holdings",
    title: "Delete a holding",
    description:
      "Permanently delete a buy lot. To record a sale instead (preserving realized P&L), use sell_lot.",
    params: [
      { name: "holding_id", type: "integer", required: true },
    ],
    returns: "{ deleted: true, holding_id }",
  },
  {
    name: "sell_lot",
    group: "Holdings",
    title: "Sell shares from a holding lot",
    description:
      "Record a partial or full sale. Reduces (or deletes if fully sold) the lot " +
      "and writes a stock_sales row with realized P&L.",
    params: [
      { name: "holding_id", type: "integer", required: true },
      { name: "shares_sold", type: "number", required: true },
      { name: "sale_price", type: "number", required: true, description: "Per-share sale price." },
      { name: "sale_date", type: "string", required: false, description: "ISO date (YYYY-MM-DD)." },
      { name: "broker", type: "string", required: false },
      { name: "notes", type: "string", required: false },
    ],
    returns: "{ sale, lot_remaining: <shares left in the lot, 0 if fully sold> }",
  },

  // ── Sales ────────────────────────────────────────────────
  {
    name: "list_stock_sales",
    group: "Sales",
    title: "List realized stock sales",
    description:
      "Return realized stock sales for a portfolio, optionally filtered by ticker.",
    params: [
      { name: "portfolio_id", type: "integer", required: true },
      { name: "ticker", type: "string", required: false },
    ],
    returns: "Array of stock_sales rows ordered by sale_date desc.",
  },

  // ── Market data ──────────────────────────────────────────
  {
    name: "search_stocks",
    group: "Market data",
    title: "Search stocks",
    description: "Search the backend for tickers matching a free-text query.",
    params: [
      { name: "q", type: "string", required: true },
      { name: "market", type: "string", required: false, description: "Optional market filter, e.g. US, HK." },
    ],
    returns: "Array of matching stock metadata.",
  },
  {
    name: "get_stock_info",
    group: "Market data",
    title: "Get stock info",
    description: "Return basic info for a ticker (name, sector, last price, ...).",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns: "Stock info object.",
  },
  {
    name: "get_stock_price",
    group: "Market data",
    title: "Get current stock price",
    description:
      "Refresh and return the current price for one or more tickers. Updates " +
      "the shared stock_catalog as a side effect.",
    params: [
      { name: "tickers", type: "string[]", required: true },
    ],
    returns: "Per-ticker price map from the backend.",
  },
  {
    name: "get_price_history",
    group: "Market data",
    title: "Get OHLC price history",
    description:
      "Return daily OHLCV price history for a ticker from the market-data backend. " +
      "Up to 10 years of daily candles are available; pick the lookback with `period`.",
    params: [
      { name: "ticker", type: "string", required: true },
      {
        name: "period",
        type: "1mo | 3mo | 6mo | 1y | 2y | 5y | 10y",
        required: false,
        description: "Lookback window. Defaults to 1y.",
      },
      {
        name: "interval",
        type: "string",
        required: false,
        description: "Candle interval, e.g. 1d. Defaults to 1d.",
      },
    ],
    returns:
      "{ ticker, interval, data: [{ Date, Open, High, Low, Close, Volume }] }, " +
      "ordered oldest → newest.",
  },

  {
    name: "get_today_signals",
    group: "Market data",
    title: "Get today's watchlist signals",
    description:
      "The daily watchlist digest: new PAM triggers (last 2 days), verdict " +
      "state changes vs the previous run, and names currently in a CONFLICTING " +
      "state. The same feed that powers the dashboard 'Today' panel.",
    params: [],
    returns: "{ pam_triggers: [...], verdict_changes: [...], conflicting: [...] }",
  },
  {
    name: "get_macro_today",
    group: "Market data",
    title: "Get macro decision surface",
    description:
      "Synthesized macro read for today — market regime, risk score, and " +
      "suggested positioning, built from VIX, business cycle (HMM), sector " +
      "rotation, and the swarm indicator.",
    params: [],
    returns: "{ regime, risk_score, positioning, components... }",
  },
  {
    name: "get_fx_rates",
    group: "Market data",
    title: "Get FX spot rates",
    description:
      "Spot FX rates for a base currency: 1 unit of base = rate units quote.",
    params: [
      { name: "base", type: "string (ISO 4217)", required: false, description: "Base currency. Defaults to USD." },
    ],
    returns: "{ base, as_of, rates: { <quote>: <rate> } }",
  },
  {
    name: "get_price_action",
    group: "Market data",
    title: "Get PAM price-action structure",
    description:
      "Top-down Price Action Manipulation (PAM) read for a ticker: daily/weekly/" +
      "monthly trend structure (UC/DC/UR/DR), setup variant (UC1/UC2/…), " +
      "sweet-spot entry zone, Force Strike Bar trigger status, and divergence. " +
      "Served from the nightly precomputed blob; computed live on cache miss. Includes `fib`: on each timeframe, the Fibonacci read of the last completed leg (golden pocket 61.8-65% as the buy or sell zone, invalidation at the leg origin, 127.2 and 161.8 extension targets, confluence with the model levels).",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns:
      "Per-timeframe structure detail plus the combined setup, sweet-spot zone, " +
      "FSB trigger, and divergence flags.",
  },

  // ── Options ──────────────────────────────────────────────
  {
    name: "get_option_expiries",
    group: "Options",
    title: "Get option expiries (IV term structure)",
    description:
      "Expiry list for a ticker with ATM IV and real-straddle expected move per " +
      "expiry — the IV term structure in one call. Polygon data, 15-min delayed.",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns: "{ ticker, spot, fetched_at, expiries: [{ expiry, dte, atm_iv, expected_move, ... }] }",
  },
  {
    name: "get_option_chain",
    group: "Options",
    title: "Get option chain (one expiry)",
    description:
      "One expiry's strike ladder: per-strike call+put with bid/ask/last, IV, " +
      "delta/gamma/theta/vega, open interest and volume, centered on spot. " +
      "Defaults to the expiry nearest 30 DTE.",
    params: [
      { name: "ticker", type: "string", required: true },
      { name: "expiry", type: "string", required: false, description: "YYYY-MM-DD; default = expiry nearest 30 DTE." },
      { name: "strikes", type: "integer (4-80)", required: false, description: "Strike rows returned, centered on spot. Default 24." },
    ],
    returns:
      "{ ticker, spot, expiry, dte, available_expiries, rows: [{ strike, " +
      "call: {...greeks}, put: {...greeks} }] }",
  },
  {
    name: "get_options_summary",
    group: "Options",
    title: "Get chain analytics summary",
    description:
      "Chain analytics card for a ticker: put/call ratio, OI ladder, IV rank & " +
      "percentile vs its own 1y history, term structure, expected move, max " +
      "pain, skew, and unusual-OI strikes.",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns: "{ ticker, fetched_at, pcr, oi_ladder, iv_rank, expected_move, max_pain, skew, unusual_oi, ... }",
  },

  {
    name: "get_options_screener",
    group: "Options",
    title: "Screen watchlist options activity",
    description:
      "Watchlist-wide options screener: per US name — verdict state, IV rank, " +
      "ATM IV, expected move, put/call ratio, and unusual-OI count. Reads " +
      "persisted daily summaries (fast; no live chain fetches).",
    params: [],
    returns: "Array of per-ticker screener rows.",
  },

  // ── News & sentiment ─────────────────────────────────────
  {
    name: "get_stock_news",
    group: "News & sentiment",
    title: "Get recent news for tickers",
    description:
      "Recent news items from the financial sentiment crawl, optionally " +
      "filtered to specific tickers and/or a single source kind.",
    params: [
      { name: "tickers", type: "string[]", required: false, description: "Tickers to filter by, e.g. [\"SATS\"]." },
      { name: "limit", type: "integer (≤200)", required: false, description: "Max items. Default 60." },
      { name: "source_kind", type: "string", required: false, description: "Single source filter." },
    ],
    returns: "Array of news items with headline, source, url, published_at, tickers, sentiment.",
  },
  {
    name: "get_stock_sentiment",
    group: "News & sentiment",
    title: "Get composite sentiment for a ticker",
    description:
      "Composite news-sentiment read for one ticker: score, direction " +
      "(bullish/bearish/neutral), confidence, buzz, and article count.",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns: "CompositeSentiment object for the ticker.",
  },
  // ── AI ───────────────────────────────────────────────────
  {
    name: "get_multibagger_candidates",
    group: "AI",
    title: "Get multibagger scan candidates",
    description:
      "Latest cached multibagger scan — high-upside candidates with factor " +
      "scores. track=A returns confirmed leaders, track=B early-stage names, " +
      "all (default) returns both. Fast read; never triggers a recompute.",
    params: [
      { name: "track", type: "all | A | B", required: false, description: "Candidate track filter. Defaults to all." },
    ],
    returns: "Array of scored candidates with per-factor breakdown.",
  },
  {
    name: "get_stock_verdict",
    group: "AI",
    title: "Get unified verdict for a ticker",
    description:
      "The unified, conflict-aware verdict from the verdict engine — blends " +
      "quant models, valuation, price action, and LLM signals into one stance. " +
      "Served from the persisted nightly blob; computed live for new names.",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns: "Verdict object: stance, conviction, contributing signals, conflicts.",
  },
  {
    name: "get_llm_thoughts",
    group: "AI",
    title: "Get FinVibe AI thoughts on a ticker",
    description:
      "Return the cached LLM analysis (summary + structured thoughts) for a ticker, if any has been generated.",
    params: [
      { name: "ticker", type: "string", required: true },
    ],
    returns: "llm_analysis row, or null if no analysis exists.",
  },
  {
    name: "enrich_stock",
    group: "AI",
    title: "Refresh price + run AI thoughts and quant models",
    description:
      "Super-admin only. Manually kick off the full enrichment pipeline for one " +
      "or more tickers: refresh price (synchronous, batched), then generate " +
      "FinVibe LLM thoughts and run all quant models (in the background after the " +
      "response). Useful when data feels stale. Requires a full-scope token whose " +
      "user is a super admin; hidden for everyone else.",
    params: [
      { name: "tickers", type: "string[]", required: true },
    ],
    returns: "{ refreshed: <count>, scheduled: <count> } once price refresh completes.",
  },
  // ── Today ────────────────────────────────────────────────
  {
    name: "get_today_reading",
    group: "Today",
    title: "Today's call",
    description:
      "The Today page's answer, composed the same way: lean, regime and risk score, which models agree, " +
      "the macro watch, the top three price-action signals and how many fired. `detail: true` adds every " +
      "component the strip is built from (VIX and term structure, breadth, dealer gamma, business cycle, " +
      "swarm, sector rotation, regime sector forecasts, the signals digest).",
    params: [{ name: "detail", type: "boolean", required: false, description: "Include the full component payloads. Default false." }],
    returns: "{ reading, lean, regime, risk_score, models[], agreement, macro_watch, top_signals[], fired_today, components? }",
  },
  {
    name: "get_sector_pulse",
    group: "Today",
    title: "Sector pulse and rotation",
    description:
      "Every GICS sector's cap-weighted return over a window, leaders first, plus the relative-rotation " +
      "quadrant of each sector ETF against SPY (leading, weakening, lagging, improving). One sentence first.",
    params: [{ name: "window", type: "string", required: false, description: "chg_1d | ret_1w | ret_1m | ret_ytd. Default chg_1d." }],
    returns: "{ reading, window, sectors[], rotation[], as_of }",
  },
  {
    name: "get_week_ahead",
    group: "Today",
    title: "The week ahead",
    description:
      "Scheduled US market events (Fed decision, CPI, PCE, jobs report, opex and quad witching, holidays and " +
      "early closes) with the latest inflation print attached to the CPI and PCE rows, joined with earnings " +
      "and ex-dividend dates for the token's watchlist and held names. Times are US Eastern.",
    params: [{ name: "weeks", type: "integer", required: false, description: "1 to 4 weeks from this Monday. Default 1." }],
    returns: "{ reading, week, through, events[], names_checked, names_total, inflation }",
  },
  {
    name: "get_book_risk",
    group: "Today",
    title: "Book risk: how many bets you really hold",
    description:
      "Correlation clusters of the token's holdings from six months of daily returns, the effective number " +
      "of bets, the largest bet and its members, beta to SPY, and the factor tilt from the ranked book. " +
      "All portfolios combined unless portfolio_id is given. Weights are by market value in the default currency.",
    params: [{ name: "portfolio_id", type: "integer", required: false, description: "One portfolio instead of all." }],
    returns: "{ reading, effective_bets, largest_bet, book_beta, clusters[], excluded[], factor_tilt[], window }",
  },

  // ── Quant ────────────────────────────────────────────────
  {
    name: "get_model_results",
    group: "Quant",
    title: "Quant model results for a ticker",
    description:
      "The name's model grid as the stock page shows it: ML ensemble forecast, gradient-boosted models, GARCH " +
      "volatility, DCF with scenarios, Piotroski, Altman, OU mean-reversion, with when each last ran.",
    params: [{ name: "ticker", type: "string", required: true }],
    returns: "{ ticker, results, last_run }",
  },
  {
    name: "get_ranked_book",
    group: "Quant",
    title: "Six-factor ranked book",
    description:
      "Every enriched name scored cross-sectionally on momentum, ML forecast, quality, value, moat and low " +
      "volatility into Long / Neutral / Short quintiles, with the book's own performance stat. " +
      "`mine: true` keeps only names on the token's watchlists.",
    params: [{ name: "mine", type: "boolean", required: false, description: "Restrict to the token's watchlist names. Default false." }],
    returns: "{ as_of, universe_size, factors[], ranked[], performance }",
  },
  {
    name: "get_heatmap",
    group: "Quant",
    title: "Market heatmap",
    description:
      "The S&P 500 and Nasdaq-100 rolled up by GICS sector by default. With `sector`, the names inside that " +
      "sector: price, day change, windowed returns, verdict and whether the name is enriched. " +
      "`universe` narrows to spx, ndx or the token's book.",
    params: [
      { name: "sector", type: "string", required: false, description: "A GICS sector name, e.g. Information Technology." },
      { name: "universe", type: "string", required: false, description: "both | spx | ndx | book. Default both." },
    ],
    returns: "{ as_of, count, sectors[] } or { as_of, sector, universe, names[] }",
  },

  // ── Desk ─────────────────────────────────────────────────
  {
    name: "get_options_desk",
    group: "Desk",
    title: "Options income desk",
    description:
      "The premium-selling ranking for short puts or covered calls: two hard gates (Altman solvency, strike " +
      "liquidity) then the weighted score (IV percentile, Piotroski, OU z-score, annualised return, margin of " +
      "safety). With `collateral` the ranking becomes a sized paper book under per-name and per-bucket caps. " +
      "Returns are mid-fill upper bounds: the plan carries no bid/ask.",
    params: [
      { name: "strategy", type: "string", required: false, description: "csp | covered_call. Default csp." },
      { name: "limit", type: "integer", required: false, description: "Rows to return. Default 40, max 120." },
      { name: "collateral", type: "number", required: false, description: "Cash to size a book with, in USD." },
      { name: "max_name_pct", type: "number", required: false },
      { name: "max_bucket_pct", type: "number", required: false },
      { name: "max_positions", type: "integer", required: false },
    ],
    returns:
      "The desk payload: rows[] with score, gates, strike, strike_source, premium, annualised return, pop_pred " +
      "(with pop_source: the engine's own number on an inherited strike, Black-Scholes from the quote's IV on a " +
      "quote-band strike); book when collateral is given.",
  },
  {
    name: "get_assignment_backtest",
    group: "Desk",
    title: "Assignment backtest",
    description:
      "Five years of daily candles, tens of thousands of simulated entries: how often a short put or call at " +
      "the given delta and days to expiry was assigned, how bad, and how often it recovered.",
    params: [
      { name: "dte", type: "integer", required: false, description: "Days to expiry. Default 30." },
      { name: "delta", type: "number", required: false, description: "Absolute delta. Default 0.25." },
      { name: "type", type: "string", required: false, description: "put | call. Default put." },
    ],
    returns: "The backtest payload as the Desk shows it.",
  },
  {
    name: "get_engine_scorecard",
    group: "Desk",
    title: "The engine's own track record",
    description:
      "Every option recommendation the engine logged, graded at expiry: win rate, captured premium (mean and " +
      "median), realised P&L on collateral, annualised return, assignment rate, mean predicted probability and " +
      "the calibration gap, overall and by strategy, model agreement, agreement within a strategy, and days to " +
      "expiry. `coverage` says what the window actually spans: tracking began 2026-06, so until the log is " +
      "older than the window every window returns the same rows.",
    params: [{ name: "window_days", type: "integer", required: false, description: "Grading window. Default 400." }],
    returns:
      "{ window_days, coverage, overall, by_strategy, by_agreement, by_strategy_agreement, by_dte, latest_review }",
  },
  {
    name: "get_track_record",
    group: "Desk",
    title: "You versus the engine",
    description:
      "The token's settled option trades graded beside the engine: your win rate against the engine's on the " +
      "same strategy, what closing early saved or cost against holding to expiry, the calibration gap on the " +
      "trades the engine priced, and cohorts by strategy, agreement and days to expiry.",
    params: [{ name: "strategy", type: "string", required: false, description: "csp | covered_call, for the engine comparison. Default csp." }],
    returns: "{ reading, summary, cohorts, engine, trades[], open_count }",
  },

  // ── Journal ──────────────────────────────────────────────
  {
    name: "list_option_trades",
    group: "Journal",
    title: "List journal trades",
    description: "The token's option trade journal: open first, then settled, newest expiry first.",
    params: [
      { name: "status", type: "string", required: false, description: "open | closed | expired | assigned." },
      { name: "ticker", type: "string", required: false },
      { name: "limit", type: "integer", required: false, description: "Default 100." },
    ],
    returns: "options_trades rows",
  },
  {
    name: "log_option_trade",
    group: "Journal",
    title: "Log an option trade",
    description:
      "Record a trade you placed elsewhere: short put, covered call or a credit spread, with strike, premium " +
      "received per share, contracts and expiry. Nothing here places an order.",
    params: [
      { name: "ticker", type: "string", required: true },
      { name: "strategy", type: "string", required: true, description: "cash_secured_put | covered_call | put_credit_spread | call_credit_spread" },
      { name: "strike_price", type: "number", required: true },
      { name: "premium", type: "number", required: true, description: "Credit received per share." },
      { name: "expiry_date", type: "string", required: true, description: "YYYY-MM-DD" },
      { name: "contracts", type: "integer", required: false, description: "Default 1." },
      { name: "entry_date", type: "string", required: false, description: "YYYY-MM-DD. Default today." },
      { name: "underlying_price_at_entry", type: "number", required: false },
      { name: "outcome_notes", type: "string", required: false },
    ],
    returns: "The new options_trades row.",
  },
  {
    name: "resolve_option_trade",
    group: "Journal",
    title: "Resolve a journal trade",
    description:
      "Close a trade as expired, assigned or bought back, with the same arithmetic the web journal uses: " +
      "realised P&L, return on collateral, annualised return, and whether it was profitable.",
    params: [
      { name: "id", type: "integer", required: true },
      { name: "status", type: "string", required: true, description: "closed | expired | assigned" },
      { name: "close_date", type: "string", required: false, description: "YYYY-MM-DD. Default today." },
      { name: "close_price", type: "number", required: false, description: "Premium paid per share to buy back (closed only)." },
      { name: "underlying_price_at_close", type: "number", required: false },
      { name: "outcome_notes", type: "string", required: false },
    ],
    returns: "The updated options_trades row.",
  },

  // ── Crypto (module; remove with src/modules/crypto) ───────
  {
    name: "get_crypto_reading",
    group: "Crypto",
    title: "The Bitcoin desk's call",
    description:
      "The crypto desk's composed reading: Bitcoin price and day change from Binance, the market-maker setup " +
      "(type, bias, confidence, entry zone, stop, targets, invalidation), the premium-or-discount zone and the " +
      "session clock, plus the liquidity map (pools, order blocks, fair-value gaps). Nothing places an order.",
    params: [{ name: "timeframe", type: "string", required: false, description: "1h | 4h | 1d | 1w. Default 4h." }],
    returns: "{ reading, price, session, setup, premium_discount, counts, liquidity, as_of }",
  },
  {
    name: "get_crypto_tickers",
    group: "Crypto",
    title: "Live coin tickers",
    description:
      "Binance 24-hour tickers (price, change, high, low, volume) for the token's crypto watchlist names, or " +
      "for any coins passed as yfinance-style symbols such as BTC-USD.",
    params: [{ name: "symbols", type: "string[]", required: false, description: "Up to 50 symbols. Default: the token's crypto watchlist names." }],
    returns: "{ as_of, source, tickers: { <symbol>: {...} }, missing[] }",
  },
];

export function toolByName(name: string): ToolDoc | undefined {
  return TOOL_CATALOG.find((t) => t.name === name);
}

// ── MCP token scopes ─────────────────────────────────────────
// A personal access token carries a scope that gates which tools it may call.
// This is enforced server-side in registerTools() — a scoped token never sees
// the tools it isn't allowed to call.
//
//   full   → every tool (legacy default; backward-compatible with old tokens)
//   manage → read tools + writes to the USER's own watchlists / portfolios /
//            holdings. Excludes non-user writes (e.g. enrich_stock).
//   read   → read-only tools only.
export type McpScope = "full" | "manage" | "read";

export const MCP_SCOPES: McpScope[] = ["full", "manage", "read"];

export const SCOPE_LABELS: Record<McpScope, string> = {
  full: "Full access — read + manage + enrichment",
  manage: "Read + manage my watchlists & portfolios",
  read: "Read-only",
};

// Tools that mutate the user's own watchlists / portfolios / holdings / sales.
export const WRITE_USER_TOOLS = new Set<string>([
  "log_option_trade",
  "resolve_option_trade",
  "create_watchlist",
  "delete_watchlist",
  "add_to_watchlist",
  "remove_from_watchlist",
  "create_portfolio",
  "delete_portfolio",
  "add_holding",
  "update_holding",
  "delete_holding",
  "sell_lot",
]);

// Side-effecting tools that are NOT plain user-data edits (compute/enrichment).
export const WRITE_OTHER_TOOLS = new Set<string>(["enrich_stock"]);

export type ToolAccess = "read" | "write_user" | "write_other";

export function toolAccess(name: string): ToolAccess {
  if (WRITE_USER_TOOLS.has(name)) return "write_user";
  if (WRITE_OTHER_TOOLS.has(name)) return "write_other";
  return "read";
}

/** Whether a token with `scope` may call the tool `name`. */
export function scopeAllows(scope: McpScope, name: string): boolean {
  const access = toolAccess(name);
  if (scope === "full") return true;
  if (scope === "read") return access === "read";
  // manage
  return access === "read" || access === "write_user";
}

/**
 * Normalise a stored scope string to an McpScope. Personal tokens and new
 * OAuth grants store "full" | "manage" | "read" directly; legacy OAuth grants
 * stored the OAuth scope string ("mcp.full") — those map to "full".
 */
export function toMcpScope(raw: string | null | undefined): McpScope {
  if (raw === "manage" || raw === "read" || raw === "full") return raw;
  return "full";
}
