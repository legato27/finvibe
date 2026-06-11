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
    async () => {
      const data = await db.listWatchlists(ctx.userId, ctx.supabase);
      // Self-heal: any stale (pending or long-stuck processing) tickers in
      // this user's watchlists or portfolio holdings get re-kicked. Same
      // helper the /api/enrich route uses so both surfaces agree.
      const backfilled = await db.sweepUserEnrichment(ctx.userId, ctx.supabase);
      return ok({ watchlists: data, backfilled });
    },
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

  server.registerTool(
    "get_price_history",
    {
      ...meta("get_price_history"),
      inputSchema: {
        ticker: z.string().min(1),
        period: z
          .enum(["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y"])
          .optional(),
        interval: z.string().min(1).optional(),
      },
    },
    async (args) =>
      ok(await market.priceHistory(args.ticker, args.period, args.interval)),
  );

  server.registerTool(
    "get_price_action",
    {
      ...meta("get_price_action"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.priceAction(args.ticker)),
  );

  server.registerTool(
    "get_today_signals",
    { ...meta("get_today_signals"), inputSchema: {} },
    async () => ok(await market.signalsToday()),
  );

  server.registerTool(
    "get_macro_today",
    { ...meta("get_macro_today"), inputSchema: {} },
    async () => ok(await market.macroToday()),
  );

  server.registerTool(
    "get_fx_rates",
    {
      ...meta("get_fx_rates"),
      inputSchema: { base: z.string().length(3).optional() },
    },
    async (args) => ok(await market.fxRates(args.base)),
  );

  // ── Options ──────────────────────────────────────────────
  server.registerTool(
    "get_option_expiries",
    {
      ...meta("get_option_expiries"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.optionExpiries(args.ticker)),
  );

  server.registerTool(
    "get_option_chain",
    {
      ...meta("get_option_chain"),
      inputSchema: {
        ticker: z.string().min(1),
        expiry: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
          .optional(),
        strikes: z.number().int().min(4).max(80).optional(),
      },
    },
    async (args) =>
      ok(await market.optionChain(args.ticker, args.expiry, args.strikes)),
  );

  server.registerTool(
    "get_options_summary",
    {
      ...meta("get_options_summary"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.optionsSummary(args.ticker)),
  );

  server.registerTool(
    "get_options_screener",
    { ...meta("get_options_screener"), inputSchema: {} },
    async () => ok(await market.optionsScreener()),
  );

  // ── News & sentiment ─────────────────────────────────────
  server.registerTool(
    "get_stock_news",
    {
      ...meta("get_stock_news"),
      inputSchema: {
        tickers: z.array(z.string().min(1)).optional(),
        limit: z.number().int().positive().max(200).optional(),
        source_kind: z.string().optional(),
      },
    },
    async (args) =>
      ok(await market.newsFeed(args.tickers, args.limit, args.source_kind)),
  );

  server.registerTool(
    "get_stock_sentiment",
    {
      ...meta("get_stock_sentiment"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.tickerSentiment(args.ticker)),
  );

  server.registerTool(
    "get_osint_events",
    {
      ...meta("get_osint_events"),
      inputSchema: {
        ticker: z.string().min(1),
        since_hours: z.number().int().min(1).max(720).optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args) =>
      ok(await market.osintEvents(args.ticker, args.since_hours, args.limit)),
  );

  // ── AI ───────────────────────────────────────────────────
  server.registerTool(
    "get_multibagger_candidates",
    {
      ...meta("get_multibagger_candidates"),
      inputSchema: { track: z.enum(["all", "A", "B"]).optional() },
    },
    async (args) => ok(await market.multibaggerCandidates(args.track)),
  );

  server.registerTool(
    "get_stock_verdict",
    {
      ...meta("get_stock_verdict"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await market.verdict(args.ticker)),
  );

  server.registerTool(
    "get_llm_thoughts",
    {
      ...meta("get_llm_thoughts"),
      inputSchema: { ticker: z.string().min(1) },
    },
    async (args) => ok(await db.getLlmThoughts(ctx.userId, ctx.supabase, args)),
  );

  server.registerTool(
    "enrich_stock",
    {
      ...meta("enrich_stock"),
      inputSchema: { tickers: z.array(z.string().min(1)).min(1) },
    },
    async (args) => {
      const tickers = [...new Set(args.tickers.map((t) => t.toUpperCase()))];

      // Single idempotent kick per ticker. DGX runs the full pipeline and is the
      // sole writer of the stock_catalog / llm_analysis mirror — we don't pull
      // DGX's view and write it ourselves anymore.
      const results = await Promise.allSettled(
        tickers.map((t) => market.enrich(t)),
      );

      const jobs = results.map((r, i) => ({
        ticker: tickers[i],
        status: r.status === "fulfilled"
          ? "enrichment_kicked"
          : `error: ${String(r.reason).slice(0, 160)}`,
      }));

      return ok({
        tickers,
        jobs,
        note:
          "Requested enrichment from DGX for each ticker. DGX runs prices → " +
          "financials → moat → DCF → ETF → trends → LLM metadata → thoughts/" +
          "models, then syncs the result to Supabase (stock_catalog + " +
          "llm_analysis). Name/sector/price appear within seconds; the rest in " +
          "30-90s. Read back via list_watchlists / get_stock_catalog.",
      });
    },
  );
}
