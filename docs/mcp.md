# vibefin MCP API

vibefin exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server so any MCP-compatible client — Claude Desktop, Claude Code, Cursor,
Cline, Continue, Windsurf, ChatGPT custom GPTs, or your own — can manage a
user's watchlists, portfolios, holdings, sells, and read market data on their
behalf.

## Endpoint

| | |
|---|---|
| URL | `https://fin.vibelife.sg/api/mcp/mcp` |
| Transport | Streamable HTTP (MCP 2025-03-26) |
| Auth | `Authorization: Bearer vbf_<64hex>` |

## Authentication

Each user generates a personal access token at
[`/settings`](https://fin.vibelife.sg/settings) → "MCP integration" → "Generate".
The plaintext secret is shown exactly once — never persisted in plaintext on
the server. Tokens are stored as `sha256(secret)` and can be revoked any time.

Every MCP request must carry the token in the `Authorization` header.
Requests without a valid token return `401 Unauthorized`.

Tokens are scoped to the user that generated them — every database query in
the MCP code path explicitly filters by `user_id`, so one user's token can
never see or touch another user's data.

## Connecting

### Claude Code

```bash
claude mcp add --transport http vibefin https://fin.vibelife.sg/api/mcp/mcp \
  --header "Authorization: vbf_<your-token>"
```

### Claude Desktop · `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vibefin": {
      "url": "https://fin.vibelife.sg/api/mcp/mcp",
      "headers": { "Authorization": "vbf_<your-token>" }
    }
  }
}
```

### Generic (JSON-RPC over HTTP)

```bash
curl -X POST https://fin.vibelife.sg/api/mcp/mcp \
  -H "Authorization: vbf_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"tools/list"
  }'
```

## Tools

The full, always-current tool reference is rendered at
[`/mcp`](https://fin.vibelife.sg/mcp) (no login required). The list below is
generated from `src/lib/mcp/catalog.ts` by `scripts/gen-mcp-docs.mjs`; the
build fails if it is stale. *Scope* is the least token scope that can call
the tool: `read` < `manage` < `full`.

### Profile

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_profile` | read | Return the signed-in user's profile (default currency, display name, email). | — |

### Watchlists

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `list_watchlists` | read | List all of the user's watchlists with their stocks. | — |
| `create_watchlist` | manage | Create a new watchlist. | `name`: string, `description`?: string |
| `delete_watchlist` | manage | Delete a watchlist and all of its items. | `watchlist_id`: integer |
| `add_to_watchlist` | manage | Add a ticker to one of the user's watchlists. Creates the stock_catalog entry if it doesn't already exist. | `watchlist_id`: integer, `ticker`: string |
| `remove_from_watchlist` | manage | Remove a ticker from one of the user's watchlists. | `watchlist_id`: integer, `ticker`: string |

### Portfolios

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `list_portfolios` | read | List all of the user's portfolios (containers only — no holdings included). | — |
| `get_portfolio` | read | Return a portfolio with its holdings, current prices, market value, weights, and unrealized P&L. | `portfolio_id`: integer |
| `create_portfolio` | manage | Create a new (empty) portfolio. | `name`: string, `description`?: string |
| `delete_portfolio` | manage | Delete a portfolio and all of its holdings and sales (cascade). | `portfolio_id`: integer |

### Holdings

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `add_holding` | manage | Record a buy lot in a portfolio. cost_basis is the per-share cost, shares is the lot size. | `portfolio_id`: integer, `ticker`: string, `shares`: number, `cost_basis`: number, `acquired_date`?: string, `broker`?: string, `notes`?: string, `currency`?: string (ISO 4217) |
| `update_holding` | manage | Patch fields on an existing buy lot. Only provided fields are changed. | `holding_id`: integer, `shares`?: number, `cost_basis`?: number, `acquired_date`?: string \| null, `broker`?: string \| null, `notes`?: string \| null |
| `delete_holding` | manage | Permanently delete a buy lot. To record a sale instead (preserving realized P&L), use sell_lot. | `holding_id`: integer |
| `sell_lot` | manage | Record a partial or full sale. Reduces (or deletes if fully sold) the lot and writes a stock_sales row with realized P&L. | `holding_id`: integer, `shares_sold`: number, `sale_price`: number, `sale_date`?: string, `broker`?: string, `notes`?: string |

### Sales

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `list_stock_sales` | read | Return realized stock sales for a portfolio, optionally filtered by ticker. | `portfolio_id`: integer, `ticker`?: string |

### Market data

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `search_stocks` | read | Search the backend for tickers matching a free-text query. | `q`: string, `market`?: string |
| `get_stock_info` | read | Return basic info for a ticker (name, sector, last price, ...). | `ticker`: string |
| `get_stock_price` | read | Refresh and return the current price for one or more tickers. Updates the shared stock_catalog as a side effect. | `tickers`: string[] |
| `get_price_history` | read | Return daily OHLCV price history for a ticker from the market-data backend. Up to 10 years of daily candles are available; pick the lookback with `period`. | `ticker`: string, `period`?: 1mo \| 3mo \| 6mo \| 1y \| 2y \| 5y \| 10y, `interval`?: string |
| `get_today_signals` | read | The daily watchlist digest: new PAM triggers (last 2 days), verdict state changes vs the previous run, and names currently in a CONFLICTING state. The same feed that powers the dashboard 'Today' panel. | — |
| `get_macro_today` | read | Synthesized macro read for today — market regime, risk score, and suggested positioning, built from VIX, business cycle (HMM), sector rotation, and the swarm indicator. | — |
| `get_fx_rates` | read | Spot FX rates for a base currency: 1 unit of base = rate units quote. | `base`?: string (ISO 4217) |
| `get_price_action` | read | Top-down Price Action Manipulation (PAM) read for a ticker: daily/weekly/monthly trend structure (UC/DC/UR/DR), setup variant (UC1/UC2/…), sweet-spot entry zone, Force Strike Bar trigger status, and divergence. Served from the nightly precomputed blob; computed live on cache miss. Includes `fib`: on each timeframe, the Fibonacci read of the last completed leg (golden pocket 61.8-65% as the buy or sell zone, invalidation at the leg origin, 127.2 and 161.8 extension targets, confluence with the model levels). | `ticker`: string |

### Options

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_option_expiries` | read | Expiry list for a ticker with ATM IV and real-straddle expected move per expiry — the IV term structure in one call. Polygon data, 15-min delayed. | `ticker`: string |
| `get_option_chain` | read | One expiry's strike ladder: per-strike call+put with bid/ask/last, IV, delta/gamma/theta/vega, open interest and volume, centered on spot. Defaults to the expiry nearest 30 DTE. | `ticker`: string, `expiry`?: string, `strikes`?: integer (4-80) |
| `get_options_summary` | read | Chain analytics card for a ticker: put/call ratio, OI ladder, IV rank & percentile vs its own 1y history, term structure, expected move, max pain, skew, and unusual-OI strikes. | `ticker`: string |
| `get_options_screener` | read | Watchlist-wide options screener: per US name — verdict state, IV rank, ATM IV, expected move, put/call ratio, and unusual-OI count. Reads persisted daily summaries (fast; no live chain fetches). | — |

### News & sentiment

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_stock_news` | read | Recent news items from the financial sentiment crawl, optionally filtered to specific tickers and/or a single source kind. | `tickers`?: string[], `limit`?: integer (≤200), `source_kind`?: string |
| `get_stock_sentiment` | read | Composite news-sentiment read for one ticker: score, direction (bullish/bearish/neutral), confidence, buzz, and article count. | `ticker`: string |

### AI

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_multibagger_candidates` | read | Latest cached multibagger scan — high-upside candidates with factor scores. track=A returns confirmed leaders, track=B early-stage names, all (default) returns both. Fast read; never triggers a recompute. | `track`?: all \| A \| B |
| `get_stock_verdict` | read | The unified, conflict-aware verdict from the verdict engine — blends quant models, valuation, price action, and LLM signals into one stance. Served from the persisted nightly blob; computed live for new names. | `ticker`: string |
| `get_llm_thoughts` | read | Return the cached LLM analysis (summary + structured thoughts) for a ticker, if any has been generated. | `ticker`: string |
| `enrich_stock` | full (admin) | Super-admin only. Manually kick off the full enrichment pipeline for one or more tickers: refresh price (synchronous, batched), then generate FinVibe LLM thoughts and run all quant models (in the background after the response). Useful when data feels stale. Requires a full-scope token whose user is a super admin; hidden for everyone else. | `tickers`: string[] |

### Today

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_today_reading` | read | The Today page's answer, composed the same way: lean, regime and risk score, which models agree, the macro watch, the top three price-action signals and how many fired. `detail: true` adds every component the strip is built from (VIX and term structure, breadth, dealer gamma, business cycle, swarm, sector rotation, regime sector forecasts, the signals digest). | `detail`?: boolean |
| `get_sector_pulse` | read | Every GICS sector's cap-weighted return over a window, leaders first, plus the relative-rotation quadrant of each sector ETF against SPY (leading, weakening, lagging, improving). One sentence first. | `window`?: string |
| `get_week_ahead` | read | Scheduled US market events (Fed decision, CPI, PCE, jobs report, opex and quad witching, holidays and early closes) with the latest inflation print attached to the CPI and PCE rows, joined with earnings and ex-dividend dates for the token's watchlist and held names. Times are US Eastern. | `weeks`?: integer |
| `get_book_risk` | read | Correlation clusters of the token's holdings from six months of daily returns, the effective number of bets, the largest bet and its members, beta to SPY, and the factor tilt from the ranked book. All portfolios combined unless portfolio_id is given. Weights are by market value in the default currency. | `portfolio_id`?: integer |

### Quant

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_model_results` | read | The name's model grid as the stock page shows it: ML ensemble forecast, gradient-boosted models, GARCH volatility, DCF with scenarios, Piotroski, Altman, OU mean-reversion, with when each last ran. | `ticker`: string |
| `get_ranked_book` | read | Every enriched name scored cross-sectionally on momentum, ML forecast, quality, value, moat and low volatility into Long / Neutral / Short quintiles, with the book's own performance stat. `mine: true` keeps only names on the token's watchlists. | `mine`?: boolean |
| `get_heatmap` | read | The S&P 500 and Nasdaq-100 rolled up by GICS sector by default. With `sector`, the names inside that sector: price, day change, windowed returns, verdict and whether the name is enriched. `universe` narrows to spx, ndx or the token's book. | `sector`?: string, `universe`?: string |

### Desk

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `get_options_desk` | read | The premium-selling ranking for short puts or covered calls: two hard gates (Altman solvency, strike liquidity) then the weighted score (IV percentile, Piotroski, OU z-score, annualised return, margin of safety). With `collateral` the ranking becomes a sized paper book under per-name and per-bucket caps. Returns are mid-fill upper bounds: the plan carries no bid/ask. | `strategy`?: string, `limit`?: integer, `collateral`?: number, `max_name_pct`?: number, `max_bucket_pct`?: number, `max_positions`?: integer |
| `get_assignment_backtest` | read | Five years of daily candles, tens of thousands of simulated entries: how often a short put or call at the given delta and days to expiry was assigned, how bad, and how often it recovered. | `dte`?: integer, `delta`?: number, `type`?: string |
| `get_engine_scorecard` | read | Every option recommendation the engine logged, graded at expiry: win rate, captured premium (mean and median), realised P&L on collateral, annualised return, assignment rate, mean predicted probability and the calibration gap, overall and by strategy, model agreement, agreement within a strategy, and days to expiry. `coverage` says what the window actually spans: tracking began 2026-06, so until the log is older than the window every window returns the same rows. | `window_days`?: integer |
| `get_track_record` | read | The token's settled option trades graded beside the engine: your win rate against the engine's on the same strategy, what closing early saved or cost against holding to expiry, the calibration gap on the trades the engine priced, and cohorts by strategy, agreement and days to expiry. | `strategy`?: string |

### Journal

| Tool | Scope | Description | Parameters |
|---|---|---|---|
| `list_option_trades` | read | The token's option trade journal: open first, then settled, newest expiry first. | `status`?: string, `ticker`?: string, `limit`?: integer |
| `log_option_trade` | manage | Record a trade you placed elsewhere: short put, covered call or a credit spread, with strike, premium received per share, contracts and expiry. Nothing here places an order. | `ticker`: string, `strategy`: string, `strike_price`: number, `premium`: number, `expiry_date`: string, `contracts`?: integer, `entry_date`?: string, `underlying_price_at_entry`?: number, `outcome_notes`?: string |
| `resolve_option_trade` | manage | Close a trade as expired, assigned or bought back, with the same arithmetic the web journal uses: realised P&L, return on collateral, annualised return, and whether it was profitable. | `id`: integer, `status`: string, `close_date`?: string, `close_price`?: number, `underlying_price_at_close`?: number, `outcome_notes`?: string |
## Implementation notes

- Server lives at `src/app/api/mcp/[transport]/route.ts`. It validates the
  Bearer header (`src/lib/mcp/tokens.ts`) before delegating to
  [`mcp-handler`](https://github.com/vercel/mcp-handler), which closes over a
  per-request `userId`.
- All CRUD lives in `src/lib/mcp/db.ts` — every function takes `userId` as
  the first arg and explicitly filters by it (the service-role Supabase
  client bypasses RLS, so this filter is the **only** ownership boundary).
- Tool docs are defined once in `src/lib/mcp/catalog.ts` and consumed both by
  the server (`src/lib/mcp/tools.ts`) and the public docs page
  (`src/app/mcp/page.tsx`).
- Token table migration: `supabase/011_mcp_tokens.sql`.

## Adding a new tool

1. Add an entry to `TOOL_CATALOG` in `src/lib/mcp/catalog.ts`.
2. Add a CRUD helper to `src/lib/mcp/db.ts` (or `market.ts` for proxied calls).
   Make sure it takes `userId` as the first arg and filters every query by it.
3. Register the tool in `src/lib/mcp/tools.ts` using `meta("<name>")` for
   title/description.
