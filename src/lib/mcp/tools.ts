import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceSupabase } from "@/lib/supabase/service";
import * as db from "@/lib/mcp/db";
import { market } from "@/lib/mcp/market";

export interface ToolContext {
  userId: string;
  supabase: ServiceSupabase;
}

function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function registerTools(server: McpServer, ctx: ToolContext) {
  // ── Profile ────────────────────────────────────────────────

  server.registerTool(
    "get_profile",
    {
      title: "Get user profile",
      description:
        "Return the signed-in user's profile (default currency, display name, email).",
      inputSchema: {},
    },
    async () => ok(await db.getProfile(ctx.userId, ctx.supabase)),
  );

  // ── Watchlists ─────────────────────────────────────────────

  server.registerTool(
    "list_watchlists",
    {
      title: "List watchlists",
      description: "List all of the user's watchlists with their stocks.",
      inputSchema: {},
    },
    async () => ok(await db.listWatchlists(ctx.userId, ctx.supabase)),
  );

  server.registerTool(
    "create_watchlist",
    {
      title: "Create a watchlist",
      description: "Create a new watchlist.",
      inputSchema: {
        name: z.string().min(1).describe("Watchlist name"),
        description: z.string().optional(),
      },
    },
    async (args) => ok(await db.createWatchlist(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "delete_watchlist",
    {
      title: "Delete a watchlist",
      description: "Delete a watchlist and all of its items.",
      inputSchema: { watchlist_id: z.number().int().positive() },
    },
    async (args) => ok(await db.deleteWatchlist(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "add_to_watchlist",
    {
      title: "Add a stock to a watchlist",
      description:
        "Add a ticker to one of the user's watchlists. Creates the stock_catalog entry if needed.",
      inputSchema: {
        watchlist_id: z.number().int().positive(),
        ticker: z.string().min(1).describe("Ticker symbol, e.g. AAPL"),
      },
    },
    async (args) => ok(await db.addToWatchlist(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "remove_from_watchlist",
    {
      title: "Remove a stock from a watchlist",
      description: "Remove a ticker from one of the user's watchlists.",
      inputSchema: {
        watchlist_id: z.number().int().positive(),
        ticker: z.string().min(1),
      },
    },
    async (args) =>
      ok(await db.removeFromWatchlist(ctx.userId, ctx.supabase, args)),
  );

  // ── Portfolios ─────────────────────────────────────────────

  server.registerTool(
    "list_portfolios",
    {
      title: "List portfolios",
      description: "List all of the user's portfolios (containers, no holdings).",
      inputSchema: {},
    },
    async () => ok(await db.listPortfolios(ctx.userId, ctx.supabase)),
  );

  server.registerTool(
    "get_portfolio",
    {
      title: "Get a portfolio",
      description:
        "Return a portfolio with its holdings, current prices, market value, " +
        "weights, and unrealized P&L.",
      inputSchema: { portfolio_id: z.number().int().positive() },
    },
    async (args) => ok(await db.getPortfolio(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "create_portfolio",
    {
      title: "Create a portfolio",
      description: "Create a new (empty) portfolio.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async (args) => ok(await db.createPortfolio(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "delete_portfolio",
    {
      title: "Delete a portfolio",
      description: "Delete a portfolio and all of its holdings and sales.",
      inputSchema: { portfolio_id: z.number().int().positive() },
    },
    async (args) => ok(await db.deletePortfolio(ctx.userId, ctx.supabase, args)),
  );

  // ── Holdings ───────────────────────────────────────────────

  server.registerTool(
    "add_holding",
    {
      title: "Add a holding (buy lot)",
      description:
        "Record a buy lot in a portfolio. shares and cost_basis are per-lot " +
        "(cost_basis is the per-share cost).",
      inputSchema: {
        portfolio_id: z.number().int().positive(),
        ticker: z.string().min(1),
        shares: z.number().positive(),
        cost_basis: z.number().nonnegative(),
        acquired_date: z
          .string()
          .optional()
          .describe("ISO date (YYYY-MM-DD)"),
        broker: z.string().optional(),
        notes: z.string().optional(),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("ISO 4217 code, defaults to USD"),
      },
    },
    async (args) => ok(await db.addHolding(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "update_holding",
    {
      title: "Update a holding",
      description:
        "Patch fields on an existing buy lot. Only provided fields are changed.",
      inputSchema: {
        holding_id: z.number().int().positive(),
        shares: z.number().positive().optional(),
        cost_basis: z.number().nonnegative().optional(),
        acquired_date: z.string().nullable().optional(),
        broker: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      },
    },
    async (args) => ok(await db.updateHolding(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "delete_holding",
    {
      title: "Delete a holding",
      description:
        "Permanently delete a holding (lot). To record a sale instead, use sell_lot.",
      inputSchema: { holding_id: z.number().int().positive() },
    },
    async (args) => ok(await db.deleteHolding(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "sell_lot",
    {
      title: "Sell shares from a holding lot",
      description:
        "Record a partial or full sale. Reduces (or deletes) the lot and writes " +
        "a stock_sales row with realized P&L.",
      inputSchema: {
        holding_id: z.number().int().positive(),
        shares_sold: z.number().positive(),
        sale_price: z.number().nonnegative(),
        sale_date: z.string().optional().describe("ISO date (YYYY-MM-DD)"),
        broker: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => ok(await db.sellLot(ctx.userId, ctx.supabase, args)),
  );

  // ── Stock sales ────────────────────────────────────────────

  server.registerTool(
    "list_stock_sales",
    {
      title: "List realized stock sales",
      description:
        "Return realized stock sales for a portfolio, optionally filtered by ticker.",
      inputSchema: {
        portfolio_id: z.number().int().positive(),
        ticker: z.string().optional(),
      },
    },
    async (args) => ok(await db.listStockSales(ctx.userId, ctx.supabase, args)),
  );

  // ── Market data ────────────────────────────────────────────

  server.registerTool(
    "search_stocks",
    {
      title: "Search stocks",
      description: "Search the DGX backend for tickers matching a free-text query.",
      inputSchema: {
        q: z.string().min(1),
        market: z.string().optional().describe("Optional market filter, e.g. US, HK"),
      },
    },
    async (args) => ok(await market.search(args.q, args.market)),
  );

  server.registerTool(
    "get_stock_info",
    {
      title: "Get stock info",
      description: "Return basic info for a ticker (name, sector, last price, ...).",
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.info(args.ticker)),
  );

  server.registerTool(
    "get_stock_price",
    {
      title: "Get current stock price",
      description:
        "Refresh and return the current price for one or more tickers. " +
        "Updates stock_catalog as a side effect.",
      inputSchema: {
        tickers: z
          .array(z.string().min(1))
          .min(1)
          .describe("List of tickers to refresh"),
      },
    },
    async (args) => ok(await market.refreshPrices(args.tickers)),
  );

  // ── LLM thoughts ───────────────────────────────────────────

  server.registerTool(
    "get_llm_thoughts",
    {
      title: "Get FinVibe AI thoughts on a ticker",
      description:
        "Return the cached LLM analysis (summary + structured thoughts) for a ticker, " +
        "if any has been generated.",
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await db.getLlmThoughts(ctx.userId, ctx.supabase, args)),
  );
}
