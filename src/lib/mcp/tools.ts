import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceSupabase } from "@/lib/supabase/service";
import * as db from "@/lib/mcp/db";
import { market } from "@/lib/mcp/market";
import { toolByName } from "@/lib/mcp/catalog";

export interface ToolContext {
  userId: string;
  supabase: ServiceSupabase;
}

function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function meta(name: string) {
  const doc = toolByName(name);
  if (!doc) throw new Error(`Missing catalog entry for tool ${name}`);
  return { title: doc.title, description: doc.description };
}

export function registerTools(server: McpServer, ctx: ToolContext) {
  // Tool titles and descriptions live in src/lib/mcp/catalog.ts
  // so they stay in sync with the public docs page at /mcp.

  // ── Profile ──────────────────────────────────────────────
  server.registerTool(
    "get_profile",
    { ...meta("get_profile"), inputSchema: {} },
    async () => ok(await db.getProfile(ctx.userId, ctx.supabase)),
  );

  // ── Watchlists ───────────────────────────────────────────
  server.registerTool(
    "list_watchlists",
    { ...meta("list_watchlists"), inputSchema: {} },
    async () => ok(await db.listWatchlists(ctx.userId, ctx.supabase)),
  );

  server.registerTool(
    "create_watchlist",
    {
      ...meta("create_watchlist"),
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async (args) => ok(await db.createWatchlist(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "delete_watchlist",
    {
      ...meta("delete_watchlist"),
      inputSchema: { watchlist_id: z.number().int().positive() },
    },
    async (args) => ok(await db.deleteWatchlist(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "add_to_watchlist",
    {
      ...meta("add_to_watchlist"),
      inputSchema: {
        watchlist_id: z.number().int().positive(),
        ticker: z.string().min(1),
      },
    },
    async (args) => ok(await db.addToWatchlist(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "remove_from_watchlist",
    {
      ...meta("remove_from_watchlist"),
      inputSchema: {
        watchlist_id: z.number().int().positive(),
        ticker: z.string().min(1),
      },
    },
    async (args) =>
      ok(await db.removeFromWatchlist(ctx.userId, ctx.supabase, args)),
  );

  // ── Portfolios ───────────────────────────────────────────
  server.registerTool(
    "list_portfolios",
    { ...meta("list_portfolios"), inputSchema: {} },
    async () => ok(await db.listPortfolios(ctx.userId, ctx.supabase)),
  );

  server.registerTool(
    "get_portfolio",
    {
      ...meta("get_portfolio"),
      inputSchema: { portfolio_id: z.number().int().positive() },
    },
    async (args) => ok(await db.getPortfolio(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "create_portfolio",
    {
      ...meta("create_portfolio"),
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
      ...meta("delete_portfolio"),
      inputSchema: { portfolio_id: z.number().int().positive() },
    },
    async (args) => ok(await db.deletePortfolio(ctx.userId, ctx.supabase, args)),
  );

  // ── Holdings ─────────────────────────────────────────────
  server.registerTool(
    "add_holding",
    {
      ...meta("add_holding"),
      inputSchema: {
        portfolio_id: z.number().int().positive(),
        ticker: z.string().min(1),
        shares: z.number().positive(),
        cost_basis: z.number().nonnegative(),
        acquired_date: z.string().optional(),
        broker: z.string().optional(),
        notes: z.string().optional(),
        currency: z.string().length(3).optional(),
      },
    },
    async (args) => ok(await db.addHolding(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "update_holding",
    {
      ...meta("update_holding"),
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
      ...meta("delete_holding"),
      inputSchema: { holding_id: z.number().int().positive() },
    },
    async (args) => ok(await db.deleteHolding(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "sell_lot",
    {
      ...meta("sell_lot"),
      inputSchema: {
        holding_id: z.number().int().positive(),
        shares_sold: z.number().positive(),
        sale_price: z.number().nonnegative(),
        sale_date: z.string().optional(),
        broker: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => ok(await db.sellLot(ctx.userId, ctx.supabase, args)),
  );

  // ── Sales ────────────────────────────────────────────────
  server.registerTool(
    "list_stock_sales",
    {
      ...meta("list_stock_sales"),
      inputSchema: {
        portfolio_id: z.number().int().positive(),
        ticker: z.string().optional(),
      },
    },
    async (args) => ok(await db.listStockSales(ctx.userId, ctx.supabase, args)),
  );

  // ── Market data ──────────────────────────────────────────
  server.registerTool(
    "search_stocks",
    {
      ...meta("search_stocks"),
      inputSchema: {
        q: z.string().min(1),
        market: z.string().optional(),
      },
    },
    async (args) => ok(await market.search(args.q, args.market)),
  );

  server.registerTool(
    "get_stock_info",
    {
      ...meta("get_stock_info"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.info(args.ticker)),
  );

  server.registerTool(
    "get_stock_price",
    {
      ...meta("get_stock_price"),
      inputSchema: { tickers: z.array(z.string().min(1)).min(1) },
    },
    async (args) => ok(await market.refreshPrices(args.tickers)),
  );

  // ── AI ───────────────────────────────────────────────────
  server.registerTool(
    "get_llm_thoughts",
    {
      ...meta("get_llm_thoughts"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await db.getLlmThoughts(ctx.userId, ctx.supabase, args)),
  );
}
