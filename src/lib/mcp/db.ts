// Server-side CRUD for MCP tools.
//
// CRITICAL: every function takes `userId` as the first arg and MUST filter
// every query by that user_id (or scope through an owned parent row).
// The supabase client here is the service-role client, which bypasses RLS.
// Forgetting the user_id filter would let one user touch another user's data.

import type { ServiceSupabase } from "@/lib/supabase/service";
import { market } from "./market";
import { pooledMap } from "@/lib/util/pool";

function tickerOf(t: string): string {
  return t.trim().toUpperCase();
}

// Plausible symbol: alphanumeric start, then [A-Z0-9.-], max 15 chars. Covers US
// tickers, SGX (O39.SI), crypto (BTC-USD), class shares (BRK.B). Rejects LLM
// special-token leakage (e.g. "<|...|>") that previously polluted stock_catalog.
// A leading caret is a yfinance index symbol (^GSPC), allowed on watchlists.
const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.-]{0,14}$/;
function assertValidTicker(t: string): string {
  const norm = tickerOf(t);
  if (!TICKER_RE.test(norm)) throw new Error(`Invalid ticker symbol: ${JSON.stringify(t)}`);
  return norm;
}

// Request enrichment from DGX. DGX is the single source of truth for stock
// details + enrichment_status and the SOLE writer of the Supabase stock_catalog
// / llm_analysis mirror. The web/MCP clients only ever (1) create the 'pending'
// request row (public.ensure_stock, inside the add RPCs) and (2) call this to
// kick the pipeline — they
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
  isSuperAdmin: boolean,
): Promise<{ kicked: boolean; error?: string; skipped?: boolean }> {
  // The enrichment pipeline (DGX) is super-admin only. For everyone else this
  // is a no-op so add/sweep flows still succeed — they just don't enrich.
  if (!isSuperAdmin) return { kicked: false, skipped: true };
  try {
    await market.enrich(ticker);
    return { kicked: true };
  } catch (err) {
    console.error(`[mcp] enrich ${ticker} failed`, err);
    return { kicked: false, error: String(err).slice(0, 200) };
  }
}

// ── The enrichment queue ───────────────────────────────────
//
// Enrichment used to be requested by writing enrichment_status='pending'
// onto the shared stock_catalog row, which DGX's poller treated as a work
// queue. Combined with `for insert to authenticated with check (true)`,
// that made the super-admin gate on /api/enrich decorative: a logged-in
// user never had to call it — one insert with the browser's anon key
// enqueued the full GPU/LLM pipeline, unattributed and unbounded.
//
// Requests now live in public.enrichment_requests, and the only supported
// way in is the file_enrichment_request RPC (supabase/018), which caps by
// the user named in the call regardless of which key made it. That last
// detail matters here: this module talks to Supabase with the SERVICE-ROLE
// client, where auth.uid() is null, so an application-side gate would be
// the only thing standing between an MCP token and an unbounded queue.
// Putting the cap in the function instead means it holds on both paths.

export type EnrichmentOutcome =
  | "filed"          // queued; DGX will pick it up
  | "already_open"   // someone already asked for this ticker
  | "capped"         // this user is at their limit
  | "invalid_ticker"
  | "error";

export async function fileEnrichmentRequest(
  supabase: ServiceSupabase,
  ticker: string,
  userId: string,
  source: "web" | "mcp" | "admin",
): Promise<{ ticker: string; outcome: EnrichmentOutcome; error?: string }> {
  const t = tickerOf(ticker);
  const { data, error } = await supabase.rpc("file_enrichment_request", {
    p_ticker: t,
    p_user: userId,
    p_source: source,
  });
  if (error) {
    console.error(`[enrich] filing ${t} failed`, error.message);
    return { ticker: t, outcome: "error", error: error.message.slice(0, 200) };
  }
  return { ticker: t, outcome: (data as EnrichmentOutcome) ?? "error" };
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
  isSuperAdmin: boolean,
  limit = 25,
): Promise<{ enriched: string[]; queued: string[]; capped: string[]; failed: string[] }> {
  const tickers = await findStaleEnrichmentTickers(userId, supabase, limit);
  if (!tickers.length) return { enriched: [], queued: [], capped: [], failed: [] };

  // File first, always. Even for a super admin: the request row is what makes
  // the work attributable and what the poller falls back to if the direct
  // kick below cannot reach the box. The cap in the RPC is what stops a
  // sweep from becoming an unbounded fan-out.
  const filed = await pooledMap(tickers, 5, (t) =>
    fileEnrichmentRequest(supabase, t, userId, "web"),
  );

  const queued: string[] = [];
  const capped: string[] = [];
  const failed: string[] = [];
  const kickable: string[] = [];
  filed.forEach((r, i) => {
    const t = tickers[i];
    if (!r) { failed.push(t); return; }
    if (r.outcome === "filed") { queued.push(t); kickable.push(t); }
    else if (r.outcome === "already_open") kickable.push(t);
    else if (r.outcome === "capped") capped.push(t);
    else failed.push(t);
  });

  // Super admins additionally get the immediate kick, so an admin sweep does
  // not wait on the webhook. Everyone else's requests are driven by the
  // Supabase DB webhook, with the 10-minute poll behind it.
  if (!isSuperAdmin || !kickable.length) {
    return { enriched: [], queued, capped, failed };
  }
  const results = await pooledMap(kickable, 5, (t) =>
    kickoffEnrichment(supabase, t, isSuperAdmin),
  );
  const enriched: string[] = [];
  results.forEach((r, i) => {
    // A failed kick is not a failed request — the row stays 'queued' and the
    // poller retries. Only report what actually started.
    if (r?.kicked) enriched.push(kickable[i]);
  });
  return { enriched, queued, capped, failed };
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

export async function addToWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number; ticker: string },
  isSuperAdmin: boolean,
) {
  await assertWatchlistOwned(userId, supabase, args.watchlist_id);

  // One statement, so the catalog row and the link commit together. The RPC
  // re-checks ownership itself — it is SECURITY DEFINER and cannot trust its
  // caller — so assertWatchlistOwned above is belt and braces, and the one
  // that produces the friendlier message.
  const { data: stockId, error } = await supabase.rpc("add_watchlist_stock", {
    p_watchlist_id: args.watchlist_id,
    p_ticker: args.ticker,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const stock = { id: stockId as number, ticker: assertValidTicker(args.ticker) };

  // File the request before kicking. The row is what makes the work
  // attributable and capped, and what the DGX poller retries from if the
  // direct kick below cannot reach the box.
  const request = await fileEnrichmentRequest(supabase, stock.ticker, userId, "mcp");
  const enrichment =
    request.outcome === "filed" || request.outcome === "already_open"
      ? await kickoffEnrichment(supabase, stock.ticker, isSuperAdmin)
      : { kicked: false, skipped: true as const };

  return {
    watchlist_id: args.watchlist_id,
    ticker: stock.ticker,
    stock_id: stock.id,
    enrichment: {
      ...enrichment,
      request: request.outcome,
      note:
        "Enrichment requested from DGX (the source of truth). Name/sector/price " +
        "mirror to stock_catalog within seconds; moat, Fair Value " +
        "(intrinsic_value), LLM intrinsic value and thoughts follow in 30-90s as " +
        "DGX completes and syncs. enrichment_status flips pending → processing → " +
        "done; this client no longer writes those fields itself. " +
        "`request` reports whether the ask was queued, already open for this " +
        "ticker, or declined because the requester is at their per-user cap.",
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
  isSuperAdmin: boolean,
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);

  // One statement: the catalog row and the holding commit together.
  const ticker = assertValidTicker(args.ticker);

  const { data, error } = await supabase.rpc("add_portfolio_holding", {
    p_portfolio_id: args.portfolio_id,
    p_ticker: ticker,
    p_shares: args.shares,
    p_cost_basis: args.cost_basis,
    p_acquired_date: args.acquired_date ?? null,
    p_broker: args.broker ?? null,
    p_notes: args.notes ?? null,
    p_currency: (args.currency ?? "USD").toUpperCase(),
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);

  await kickoffEnrichment(supabase, ticker, isSuperAdmin);

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

// ── Trade journal (user-scoped; options and the crypto scalp family) ──
//
// One table, two families. The options path below is the original code:
// same insert shape, same resolve arithmetic, and the alias tools select the
// original column list so their payloads are byte-identical to before the
// table gained the crypto columns. mode is a hard column, never inferred:
// the readers default to live for options and paper for crypto.

export type JournalStrategy = "cash_secured_put" | "covered_call" | "put_credit_spread" | "call_credit_spread";
export type ScalpStrategy = "scalp_A" | "scalp_B" | "scalp_C";
export type JournalStatus = "open" | "closed" | "expired" | "assigned";
export type AssetClass = "options" | "crypto";
export type TradeMode = "live" | "paper" | "backtest";

/** The columns options_trades had before migration 025 — what the option-named tools return. */
export const OPTION_TRADE_COLUMNS =
  "id, user_id, ticker, strategy, strike_price, premium, contracts, expiry_date, entry_date, underlying_price_at_entry, " +
  "status, close_date, close_price, underlying_price_at_close, realized_pnl, return_on_capital, annualized_return, " +
  "llm_recommendation, llm_confidence, llm_reasoning, llm_model_version, outcome_notes, was_profitable, created_at, updated_at";

export const DEFAULT_MODE: Record<AssetClass, TradeMode> = { options: "live", crypto: "paper" };

export async function listTrades(
  userId: string,
  supabase: ServiceSupabase,
  args: { asset_class?: AssetClass; strategy?: string; mode?: TradeMode; status?: JournalStatus; ticker?: string; limit?: number },
  columns = "*",
) {
  const assetClass: AssetClass = args.asset_class ?? "options";
  const mode: TradeMode = args.mode ?? DEFAULT_MODE[assetClass];
  let q = supabase
    .from("options_trades")
    .select(columns)
    .eq("user_id", userId)
    .eq("asset_class", assetClass)
    .eq("mode", mode)
    .order("status", { ascending: true })
    .order(assetClass === "options" ? "expiry_date" : "entry_ts", { ascending: false })
    .limit(args.limit ?? 100);
  if (args.status) q = q.eq("status", args.status);
  if (args.strategy) q = q.eq("strategy", args.strategy);
  if (args.ticker) q = q.eq("ticker", tickerOf(args.ticker));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Alias kept for the option-named tool: options, live, original columns. */
export async function listOptionTrades(
  userId: string,
  supabase: ServiceSupabase,
  args: { status?: JournalStatus; ticker?: string; limit?: number },
) {
  return listTrades(userId, supabase, { ...args, asset_class: "options", mode: "live" }, OPTION_TRADE_COLUMNS);
}

export type LogOptionArgs = {
  ticker: string; strategy: JournalStrategy; strike_price: number; premium: number; contracts?: number;
  expiry_date: string; entry_date?: string; underlying_price_at_entry?: number | null; outcome_notes?: string | null;
};
export type LogCryptoArgs = {
  symbol: string; strategy: ScalpStrategy; side: "long" | "short"; entry_px: number; size: number;
  mode?: TradeMode; venue?: string; entry_ts?: string; fees?: number | null; stop_px?: number | null; target_px?: number | null;
  r_planned?: number | null; slippage_modelled?: number | null; packet_id?: string | null; engine_signal_id?: string | null;
  regime_at_entry?: Record<string, unknown> | null; session?: string | null; outcome_notes?: string | null;
};

export async function logTrade(
  userId: string,
  supabase: ServiceSupabase,
  args: ({ asset_class?: "options" } & LogOptionArgs) | ({ asset_class: "crypto" } & LogCryptoArgs),
  columns = "*",
) {
  if (args.asset_class === "crypto") {
    const a = args;
    const entryTs = a.entry_ts || new Date().toISOString();
    const { data, error } = await supabase
      .from("options_trades")
      .insert({
        user_id: userId,
        ticker: assertValidTicker(a.symbol),
        strategy: a.strategy,
        asset_class: "crypto",
        mode: a.mode ?? DEFAULT_MODE.crypto,
        venue: a.venue ?? "binance-usdm",
        side: a.side,
        entry_ts: entryTs,
        entry_date: entryTs.slice(0, 10),
        entry_px: a.entry_px,
        size: a.size,
        fees: a.fees ?? null,
        stop_px: a.stop_px ?? null,
        target_px: a.target_px ?? null,
        r_planned: a.r_planned ?? null,
        slippage_modelled: a.slippage_modelled ?? null,
        packet_id: a.packet_id ?? null,
        engine_signal_id: a.engine_signal_id ?? null,
        regime_at_entry: a.regime_at_entry ?? null,
        session: a.session ?? null,
        underlying_price_at_entry: a.entry_px,
        outcome_notes: a.outcome_notes ?? null,
        status: "open",
      })
      .select(columns)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const a = args;
  const { data, error } = await supabase
    .from("options_trades")
    .insert({
      user_id: userId,
      ticker: assertValidTicker(a.ticker),
      strategy: a.strategy,
      strike_price: a.strike_price,
      premium: a.premium,
      contracts: a.contracts ?? 1,
      expiry_date: a.expiry_date,
      entry_date: a.entry_date || new Date().toISOString().slice(0, 10),
      underlying_price_at_entry: a.underlying_price_at_entry ?? null,
      outcome_notes: a.outcome_notes ?? null,
      status: "open",
    })
    .select(columns)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Alias kept for the option-named tool. */
export async function logOptionTrade(userId: string, supabase: ServiceSupabase, args: LogOptionArgs) {
  return logTrade(userId, supabase, { ...args, asset_class: "options" }, OPTION_TRADE_COLUMNS);
}

export type ResolveOptionArgs = {
  id: number; status: Exclude<JournalStatus, "open">; close_date?: string;
  close_price?: number | null; underlying_price_at_close?: number | null; outcome_notes?: string | null;
};
export type ResolveCryptoArgs = {
  id: number; exit_px: number; exit_ts?: string; exit_reason: "target" | "stop" | "time_stop" | "manual" | "risk" | "other";
  fees?: number | null; funding?: number | null; slippage_realised?: number | null; mae?: number | null; mfe?: number | null;
  outcome_notes?: string | null;
};

/**
 * Same arithmetic as the web journal's resolve: assigned and expired keep
 * the full credit, a buy-back keeps the difference; return on capital is
 * earned on the collateral; an assignment is judged on the position
 * (spot against strike minus premium), not on the option leg.
 *
 * A crypto row settles on its fill: P&L is the signed price move times size
 * net of fees and funding, R is that P&L over the planned risk (entry to
 * stop, times size), return on capital is on notional, annualised by hours.
 */
export async function resolveTrade(
  userId: string,
  supabase: ServiceSupabase,
  args: ({ asset_class?: "options" } & ResolveOptionArgs) | ({ asset_class: "crypto" } & ResolveCryptoArgs),
  columns = "*",
) {
  const { data: t, error: readErr } = await supabase
    .from("options_trades")
    .select("*")
    .eq("id", args.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!t) throw new Error(`Trade ${args.id} not found`);
  if (t.status !== "open") throw new Error(`Trade ${args.id} is already ${t.status}`);
  const rowClass: AssetClass = (t.asset_class as AssetClass) ?? "options";
  const wantClass: AssetClass = args.asset_class ?? "options";
  if (rowClass !== wantClass) throw new Error(`Trade ${args.id} is a ${rowClass} trade; resolve it as ${rowClass}`);

  if (args.asset_class === "crypto") {
    const a = args;
    const sign = t.side === "short" ? -1 : 1;
    const size = Number(t.size);
    const entry = Number(t.entry_px);
    const exitTs = a.exit_ts || new Date().toISOString();
    const fees = a.fees ?? t.fees ?? 0;
    const funding = a.funding ?? 0;
    const gross = sign * (a.exit_px - entry) * size;
    const realized = gross - Number(fees) - Number(funding);
    const riskUsd = t.stop_px != null ? Math.abs(entry - Number(t.stop_px)) * size : null;
    const rRealised = riskUsd && riskUsd > 0 ? realized / riskUsd : null;
    const notional = entry * size;
    const roc = notional > 0 ? realized / notional : null;
    const hours = Math.max(1 / 60, (Date.parse(exitTs) - Date.parse(String(t.entry_ts))) / 3_600_000);
    const { data, error } = await supabase
      .from("options_trades")
      .update({
        status: "closed",
        exit_ts: exitTs,
        close_date: exitTs.slice(0, 10),
        exit_px: a.exit_px,
        underlying_price_at_close: a.exit_px,
        exit_reason: a.exit_reason,
        fees,
        funding,
        slippage_realised: a.slippage_realised ?? null,
        mae: a.mae ?? null,
        mfe: a.mfe ?? null,
        realized_pnl: realized,
        r_realised: rRealised,
        return_on_capital: roc,
        annualized_return: roc != null ? (roc * 365 * 24) / hours : null,
        was_profitable: realized > 0,
        outcome_notes: a.outcome_notes ?? t.outcome_notes ?? null,
      })
      .eq("id", args.id)
      .eq("user_id", userId)
      .select(columns)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const a = args;
  const shares = Number(t.contracts) * 100;
  const credit = Number(t.premium) * shares;
  const paidBack = (a.close_price ?? 0) * shares;
  const realized = a.status === "closed" ? credit - paidBack : credit;
  const capital = Number(t.strike_price) * shares;
  const closeDate = a.close_date || new Date().toISOString().slice(0, 10);
  const days = Math.max(1, Math.round((Date.parse(closeDate) - Date.parse(String(t.entry_date))) / 86_400_000));
  const roc = capital > 0 ? realized / capital : null;
  const netBasis = Number(t.strike_price) - Number(t.premium);
  const spot = a.underlying_price_at_close ?? null;
  const profitable = a.status === "assigned" ? (spot != null ? spot >= netBasis : null) : realized > 0;

  const { data, error } = await supabase
    .from("options_trades")
    .update({
      status: a.status,
      close_date: closeDate,
      close_price: a.close_price ?? null,
      underlying_price_at_close: spot,
      realized_pnl: realized,
      return_on_capital: roc,
      annualized_return: roc != null ? (roc * 365) / days : null,
      was_profitable: profitable,
      outcome_notes: a.outcome_notes ?? t.outcome_notes ?? null,
    })
    .eq("id", args.id)
    .eq("user_id", userId)
    .select(columns)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Alias kept for the option-named tool. */
export async function resolveOptionTrade(userId: string, supabase: ServiceSupabase, args: ResolveOptionArgs) {
  return resolveTrade(userId, supabase, { ...args, asset_class: "options" }, OPTION_TRADE_COLUMNS);
}
