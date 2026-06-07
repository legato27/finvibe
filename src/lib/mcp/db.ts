// Server-side CRUD for MCP tools.
//
// CRITICAL: every function takes `userId` as the first arg and MUST filter
// every query by that user_id (or scope through an owned parent row).
// The supabase client here is the service-role client, which bypasses RLS.
// Forgetting the user_id filter would let one user touch another user's data.

import type { ServiceSupabase } from "@/lib/supabase/service";
import { market } from "./market";

function tickerOf(t: string): string {
  return t.trim().toUpperCase();
}

// Plausible symbol: alphanumeric start, then [A-Z0-9.-], max 15 chars. Covers US
// tickers, SGX (O39.SI), crypto (BTC-USD), class shares (BRK.B). Rejects LLM
// special-token leakage (e.g. "<|...|>") that previously polluted stock_catalog.
const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
function assertValidTicker(t: string): string {
  const norm = tickerOf(t);
  if (!TICKER_RE.test(norm)) throw new Error(`Invalid ticker symbol: ${JSON.stringify(t)}`);
  return norm;
}

// Request enrichment from DGX. DGX is the single source of truth for stock
// details + enrichment_status and the SOLE writer of the Supabase stock_catalog
// / llm_analysis mirror. The web/MCP clients only ever (1) create the 'pending'
// request row (getOrCreateStock) and (2) call this to kick the pipeline — they
// no longer pull DGX's view and write fields/status themselves. That old
// dual-writer design (two engines racing on the same rows, with different field
// sets and different meanings of "done") is what made the two databases
// disagree. DGX's /watchlist/enrich is idempotent and:
//   - ensures its local row + runs the full pipeline,
//   - mirrors name/sector/price early (status stays 'processing'),
//   - pushes the full stock + llm projection once, at the end (status 'done'),
//   - and a periodic reconcile task backstops any missed push.
export async function kickoffEnrichment(
  _supabase: ServiceSupabase,
  ticker: string,
): Promise<{ kicked: boolean; error?: string }> {
  try {
    await market.enrich(ticker);
    return { kicked: true };
  } catch (err) {
    console.error(`[mcp] enrich ${ticker} failed`, err);
    return { kicked: false, error: String(err).slice(0, 200) };
  }
}

// Find tickers across the user's watchlists + portfolio holdings whose
// stock_catalog rows are still stuck enriching. "Stuck" means:
//   - enrichment_status = 'pending', OR
//   - enrichment_status = 'processing' but updated_at is older than the
//     STALE_PROCESSING_MIN cutoff (DGX worker probably dropped the ball).
const STALE_PROCESSING_MIN = 10;

export async function findStaleEnrichmentTickers(
  userId: string,
  supabase: ServiceSupabase,
  limit = 25,
): Promise<string[]> {
  const cutoff = new Date(
    Date.now() - STALE_PROCESSING_MIN * 60_000,
  ).toISOString();

  // Watchlist tickers via watchlists → watchlist_items → stock_catalog.
  const { data: wl } = await supabase
    .from("watchlists")
    .select("watchlist_items(stock_catalog(ticker, enrichment_status, updated_at))")
    .eq("user_id", userId);

  // Portfolio tickers — direct user_id filter on portfolio_holdings, then
  // join stock_catalog by ticker (separate query since holdings store the
  // ticker text, not a stock_id).
  const { data: holdings } = await supabase
    .from("portfolio_holdings")
    .select("ticker")
    .eq("user_id", userId);

  const out = new Set<string>();
  for (const w of wl ?? []) {
    const items = (w as { watchlist_items?: Array<{ stock_catalog?: { ticker?: string; enrichment_status?: string; updated_at?: string } | null }> }).watchlist_items ?? [];
    for (const it of items) {
      const sc = it?.stock_catalog;
      if (!sc?.ticker) continue;
      if (sc.enrichment_status === "pending") out.add(sc.ticker);
      else if (
        sc.enrichment_status === "processing" &&
        sc.updated_at &&
        sc.updated_at < cutoff
      )
        out.add(sc.ticker);
    }
  }

  const holdingTickers = (holdings ?? [])
    .map((h: { ticker?: string }) => h.ticker)
    .filter((t): t is string => !!t);
  if (holdingTickers.length) {
    const { data: stocks } = await supabase
      .from("stock_catalog")
      .select("ticker, enrichment_status, updated_at")
      .in("ticker", [...new Set(holdingTickers)]);
    for (const s of stocks ?? []) {
      const sc = s as { ticker: string; enrichment_status?: string; updated_at?: string };
      if (sc.enrichment_status === "pending") out.add(sc.ticker);
      else if (
        sc.enrichment_status === "processing" &&
        sc.updated_at &&
        sc.updated_at < cutoff
      )
        out.add(sc.ticker);
    }
  }

  return [...out].slice(0, limit);
}

// Re-kick enrichment for the user's stale tickers. Both the web /api/enrich
// route and the MCP list_watchlists path delegate here so they agree on
// what "stale" means and how it gets recovered.
export async function sweepUserEnrichment(
  userId: string,
  supabase: ServiceSupabase,
  limit = 25,
): Promise<{ enriched: string[]; failed: string[] }> {
  const tickers = await findStaleEnrichmentTickers(userId, supabase, limit);
  if (!tickers.length) return { enriched: [], failed: [] };
  const results = await Promise.allSettled(
    tickers.map((t) => kickoffEnrichment(supabase, t)),
  );
  const enriched: string[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") enriched.push(tickers[i]);
    else failed.push(tickers[i]);
  });
  return { enriched, failed };
}

// ── Profile ────────────────────────────────────────────────

export async function getProfile(userId: string, supabase: ServiceSupabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, default_currency")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Watchlists ─────────────────────────────────────────────

export async function listWatchlists(userId: string, supabase: ServiceSupabase) {
  const { data, error } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*, stock_catalog(*))")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { name: string; description?: string },
) {
  const { data, error } = await supabase
    .from("watchlists")
    .insert({ user_id: userId, name: args.name, description: args.description ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number },
) {
  // Ownership check — service role bypasses RLS so we must filter explicitly.
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", args.watchlist_id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { deleted: true, watchlist_id: args.watchlist_id };
}

async function assertWatchlistOwned(
  userId: string,
  supabase: ServiceSupabase,
  watchlistId: number,
) {
  const { data, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("id", watchlistId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Watchlist ${watchlistId} not found`);
}

async function getOrCreateStock(supabase: ServiceSupabase, ticker: string) {
  const t = assertValidTicker(ticker);
  const existing = await supabase
    .from("stock_catalog")
    .select("id, ticker")
    .eq("ticker", t)
    .maybeSingle();
  if (existing.data) return existing.data;

  const { data, error } = await supabase
    .from("stock_catalog")
    .insert({ ticker: t, enrichment_status: "pending" })
    .select("id, ticker")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addToWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number; ticker: string },
) {
  await assertWatchlistOwned(userId, supabase, args.watchlist_id);
  const stock = await getOrCreateStock(supabase, args.ticker);
  const { error } = await supabase
    .from("watchlist_items")
    .insert({ watchlist_id: args.watchlist_id, stock_id: stock.id });
  if (error) throw new Error(error.message);

  const enrichment = await kickoffEnrichment(supabase, stock.ticker);

  return {
    watchlist_id: args.watchlist_id,
    ticker: stock.ticker,
    stock_id: stock.id,
    enrichment: {
      ...enrichment,
      note:
        "Enrichment requested from DGX (the source of truth). Name/sector/price " +
        "mirror to stock_catalog within seconds; moat, Fair Value " +
        "(intrinsic_value), LLM intrinsic value and thoughts follow in 30-90s as " +
        "DGX completes and syncs. enrichment_status flips pending → processing → " +
        "done; this client no longer writes those fields itself.",
    },
  };
}

export async function removeFromWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number; ticker: string },
) {
  await assertWatchlistOwned(userId, supabase, args.watchlist_id);
  const t = tickerOf(args.ticker);
  const { data: stock, error: stockErr } = await supabase
    .from("stock_catalog")
    .select("id")
    .eq("ticker", t)
    .maybeSingle();
  if (stockErr) throw new Error(stockErr.message);
  if (!stock) return { removed: 0 };

  const { error, count } = await supabase
    .from("watchlist_items")
    .delete({ count: "exact" })
    .eq("watchlist_id", args.watchlist_id)
    .eq("stock_id", stock.id);
  if (error) throw new Error(error.message);
  return { removed: count ?? 0, watchlist_id: args.watchlist_id, ticker: t };
}

// ── Portfolios ─────────────────────────────────────────────

export async function listPortfolios(userId: string, supabase: ServiceSupabase) {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPortfolio(
  userId: string,
  supabase: ServiceSupabase,
  args: { name: string; description?: string },
) {
  const { data, error } = await supabase
    .from("portfolios")
    .insert({ user_id: userId, name: args.name, description: args.description ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePortfolio(
  userId: string,
  supabase: ServiceSupabase,
  args: { portfolio_id: number },
) {
  const { error } = await supabase
    .from("portfolios")
    .delete()
    .eq("id", args.portfolio_id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { deleted: true, portfolio_id: args.portfolio_id };
}

async function assertPortfolioOwned(
  userId: string,
  supabase: ServiceSupabase,
  portfolioId: number,
) {
  const { data, error } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Portfolio ${portfolioId} not found`);
}

export async function getPortfolio(
  userId: string,
  supabase: ServiceSupabase,
  args: { portfolio_id: number },
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);

  const { data: portfolio, error: pErr } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", args.portfolio_id)
    .single();
  if (pErr) throw new Error(pErr.message);

  const { data: holdings, error: hErr } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("portfolio_id", args.portfolio_id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (hErr) throw new Error(hErr.message);

  const tickers = [...new Set((holdings ?? []).map((h: any) => h.ticker))];
  let stockMap: Record<string, any> = {};
  if (tickers.length) {
    const { data: stocks } = await supabase
      .from("stock_catalog")
      .select("ticker, name, last_price, last_price_updated_at, sector")
      .in("ticker", tickers);
    for (const s of stocks ?? []) stockMap[(s as any).ticker] = s;
  }

  const enriched = (holdings ?? []).map((h: any) => {
    const stock = stockMap[h.ticker];
    const current_price = stock?.last_price ?? null;
    const mkt_value = current_price != null ? Number(h.shares) * Number(current_price) : null;
    const cost_value = Number(h.shares) * Number(h.cost_basis);
    const unrealized_pnl = mkt_value != null ? mkt_value - cost_value : null;
    return {
      id: h.id,
      ticker: h.ticker,
      name: stock?.name ?? null,
      sector: stock?.sector ?? null,
      shares: Number(h.shares),
      cost_basis: Number(h.cost_basis),
      currency: (h.currency || "USD").toUpperCase(),
      acquired_date: h.acquired_date,
      broker: h.broker,
      notes: h.notes,
      current_price,
      last_price_updated_at: stock?.last_price_updated_at ?? null,
      mkt_value,
      cost_value,
      unrealized_pnl,
    };
  });

  const total_value = enriched.reduce(
    (sum, h) => sum + (h.mkt_value ?? h.cost_value),
    0,
  );
  const withWeights = enriched.map((h) => ({
    ...h,
    weight_pct: total_value > 0 ? ((h.mkt_value ?? h.cost_value) / total_value) * 100 : 0,
  }));

  const total_cost = enriched.reduce((sum, h) => sum + h.cost_value, 0);
  const total_unrealized_pnl = withWeights.reduce(
    (sum, h) => sum + (h.unrealized_pnl ?? 0),
    0,
  );

  return {
    portfolio,
    holdings: withWeights,
    totals: {
      value: total_value,
      cost: total_cost,
      unrealized_pnl: total_unrealized_pnl,
      lot_count: withWeights.length,
    },
  };
}

// ── Holdings ───────────────────────────────────────────────

export async function addHolding(
  userId: string,
  supabase: ServiceSupabase,
  args: {
    portfolio_id: number;
    ticker: string;
    shares: number;
    cost_basis: number;
    acquired_date?: string;
    broker?: string;
    notes?: string;
    currency?: string;
  },
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);
  const stock = await getOrCreateStock(supabase, args.ticker);
  const { data, error } = await supabase
    .from("portfolio_holdings")
    .insert({
      user_id: userId,
      portfolio_id: args.portfolio_id,
      ticker: stock.ticker,
      shares: args.shares,
      cost_basis: args.cost_basis,
      acquired_date: args.acquired_date ?? null,
      broker: args.broker ?? null,
      notes: args.notes ?? null,
      currency: (args.currency ?? "USD").toUpperCase(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await kickoffEnrichment(supabase, stock.ticker);

  return data;
}

export async function updateHolding(
  userId: string,
  supabase: ServiceSupabase,
  args: {
    holding_id: number;
    shares?: number;
    cost_basis?: number;
    acquired_date?: string | null;
    broker?: string | null;
    notes?: string | null;
  },
) {
  const patch: Record<string, unknown> = {};
  if (args.shares !== undefined) patch.shares = args.shares;
  if (args.cost_basis !== undefined) patch.cost_basis = args.cost_basis;
  if (args.acquired_date !== undefined) patch.acquired_date = args.acquired_date;
  if (args.broker !== undefined) patch.broker = args.broker;
  if (args.notes !== undefined) patch.notes = args.notes;

  const { data, error } = await supabase
    .from("portfolio_holdings")
    .update(patch)
    .eq("id", args.holding_id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteHolding(
  userId: string,
  supabase: ServiceSupabase,
  args: { holding_id: number },
) {
  const { error, count } = await supabase
    .from("portfolio_holdings")
    .delete({ count: "exact" })
    .eq("id", args.holding_id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!count) throw new Error(`Holding ${args.holding_id} not found`);
  return { deleted: true, holding_id: args.holding_id };
}

export async function sellLot(
  userId: string,
  supabase: ServiceSupabase,
  args: {
    holding_id: number;
    shares_sold: number;
    sale_price: number;
    sale_date?: string;
    broker?: string;
    notes?: string;
  },
) {
  if (args.shares_sold <= 0) throw new Error("shares_sold must be positive");

  // Ownership-scoped lookup.
  const { data: lot, error: lotErr } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("id", args.holding_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (lotErr) throw new Error(lotErr.message);
  if (!lot) throw new Error(`Holding ${args.holding_id} not found`);
  if (args.shares_sold > Number(lot.shares) + 1e-9) {
    throw new Error(
      `Cannot sell ${args.shares_sold} shares — lot only holds ${lot.shares}`,
    );
  }

  const realized_pnl = (args.sale_price - Number(lot.cost_basis)) * args.shares_sold;

  const { data: sale, error: saleErr } = await supabase
    .from("stock_sales")
    .insert({
      user_id: userId,
      portfolio_id: lot.portfolio_id,
      holding_id: lot.id,
      ticker: lot.ticker,
      shares_sold: args.shares_sold,
      sale_price: args.sale_price,
      cost_basis: lot.cost_basis,
      realized_pnl,
      currency: (lot.currency || "USD").toUpperCase(),
      sale_date: args.sale_date ?? null,
      broker: args.broker ?? lot.broker ?? null,
      notes: args.notes ?? null,
    })
    .select()
    .single();
  if (saleErr) throw new Error(saleErr.message);

  const remaining = Number(lot.shares) - args.shares_sold;
  let lot_remaining: number;
  if (remaining <= 1e-9) {
    const { error: delErr } = await supabase
      .from("portfolio_holdings")
      .delete()
      .eq("id", lot.id)
      .eq("user_id", userId);
    if (delErr) throw new Error(delErr.message);
    lot_remaining = 0;
  } else {
    const { error: updErr } = await supabase
      .from("portfolio_holdings")
      .update({ shares: remaining })
      .eq("id", lot.id)
      .eq("user_id", userId);
    if (updErr) throw new Error(updErr.message);
    lot_remaining = remaining;
  }

  return { sale, lot_remaining };
}

// ── Stock sales ────────────────────────────────────────────

export async function listStockSales(
  userId: string,
  supabase: ServiceSupabase,
  args: { portfolio_id: number; ticker?: string },
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);
  let q = supabase
    .from("stock_sales")
    .select("*")
    .eq("portfolio_id", args.portfolio_id)
    .eq("user_id", userId)
    .order("sale_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (args.ticker) q = q.eq("ticker", tickerOf(args.ticker));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── LLM thoughts (read-only, public-ish) ───────────────────

export async function getLlmThoughts(
  _userId: string,
  supabase: ServiceSupabase,
  args: { ticker: string },
) {
  const { data, error } = await supabase
    .from("llm_analysis")
    .select("*")
    .eq("ticker", tickerOf(args.ticker))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// ── Stock catalog (read current cached price) ──────────────

export async function getStockCatalog(
  _userId: string,
  supabase: ServiceSupabase,
  args: { ticker: string },
) {
  const { data, error } = await supabase
    .from("stock_catalog")
    .select("*")
    .eq("ticker", tickerOf(args.ticker))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
