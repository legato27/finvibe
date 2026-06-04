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
  | "AI";

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

  // ── AI ───────────────────────────────────────────────────
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
      "Manually kick off the full enrichment pipeline for one or more tickers: " +
      "refresh price (synchronous, batched), then generate FinVibe LLM thoughts and " +
      "run all quant models (in the background after the response). Useful when " +
      "data feels stale; runs automatically when adding to a watchlist or holding.",
    params: [
      { name: "tickers", type: "string[]", required: true },
    ],
    returns: "{ refreshed: <count>, scheduled: <count> } once price refresh completes.",
  },
];

export function toolByName(name: string): ToolDoc | undefined {
  return TOOL_CATALOG.find((t) => t.name === name);
}
