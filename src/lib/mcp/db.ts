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

// Pull DGX's full view of a ticker (stock_catalog basics + LLM sub-object)
// and mirror it into Supabase ourselves. DGX has its own enrichment worker
// that eventually syncs to Supabase, but timing is unreliable — this puts
// MCP in the driver's seat so the watchlist UI shows what DGX knows.
export async function ensureBasicEnrichment(
  supabase: ServiceSupabase,
  ticker: string,
): Promise<{ basic_fields: string[]; llm_fields: string[] }> {
  const result = { basic_fields: [] as string[], llm_fields: [] as string[] };
  try {
    const detail = (await market.detail(ticker)) as Record<string, unknown> | null;
    if (!detail) return result;

    // 1. Update stock_catalog with whatever DGX has populated.
    const stockPatch: Record<string, unknown> = {};
    const copy = (k: string, v: unknown, write?: string) => {
      if (v === null || v === undefined) return;
      stockPatch[write ?? k] = v;
    };
    copy("name", detail.name);
    copy("sector", detail.sector);
    copy("industry", detail.industry);
    copy("description", detail.description);
    if (typeof detail.last_price === "number") {
      stockPatch.last_price = detail.last_price;
      stockPatch.last_price_updated_at = new Date().toISOString();
    }
    copy("ten_yr_low", detail.ten_yr_low);
    copy("ten_yr_high", detail.ten_yr_high);
    copy("moat_rating", detail.moat_rating);
    copy("moat_confidence", detail.moat_confidence);
    copy("moat_detail", detail.moat_detail);
    copy("intrinsic_value", detail.intrinsic_value);
    copy("margin_of_safety", detail.margin_of_safety);
    copy("wacc", detail.wacc);
    copy("quarterly_trend", detail.quarterly_trend);
    copy("yearly_trend", detail.yearly_trend);
    copy("is_etf", detail.is_etf);
    copy("etf_memberships", detail.etf_memberships);
    if (
      typeof detail.enrichment_status === "string" &&
      detail.enrichment_status !== "pending"
    ) {
      stockPatch.enrichment_status = detail.enrichment_status;
    }
    if (Object.keys(stockPatch).length) {
      const { error } = await supabase
        .from("stock_catalog")
        .update(stockPatch)
        .eq("ticker", ticker);
      if (error) {
        console.error(`[mcp] stock_catalog update ${ticker}:`, error);
      } else {
        result.basic_fields = Object.keys(stockPatch);
      }
    }

    // 2. Upsert llm_analysis from the nested `llm` object if DGX has any.
    const llm = detail.llm as Record<string, unknown> | null | undefined;
    if (llm && typeof llm === "object") {
      const llmPatch: Record<string, unknown> = { ticker };
      const llmCopy = (k: string, v: unknown, write: string) => {
        if (v === null || v === undefined) return;
        llmPatch[write] = v;
      };
      llmCopy("sector", llm.sector, "llm_sector");
      llmCopy("moat", llm.moat, "llm_moat");
      llmCopy("description", llm.description, "llm_description");
      llmCopy("intrinsic_value", llm.intrinsic_value, "llm_intrinsic_value");
      llmCopy("margin_of_safety", llm.margin_of_safety, "llm_margin_of_safety");
      llmCopy("thoughts_summary", llm.thoughts_summary, "thoughts_summary");
      llmCopy(
        "thoughts_generated_at",
        llm.thoughts_generated_at,
        "thoughts_generated_at",
      );
      // Only upsert if we got at least one substantive field beyond the ticker.
      if (Object.keys(llmPatch).length > 1) {
        const { error } = await supabase
          .from("llm_analysis")
          .upsert(llmPatch, { onConflict: "ticker" });
        if (error) {
          console.error(`[mcp] llm_analysis upsert ${ticker}:`, error);
        } else {
          result.llm_fields = Object.keys(llmPatch).filter((k) => k !== "ticker");
        }
      }
    }
  } catch (err) {
    console.error(`[mcp] ensureBasicEnrichment ${ticker} failed`, err);
  }
  return result;
}

// Synchronously populate name/sector/price into stock_catalog (so the
// watchlist UI shows data immediately on next read), then queue the
// LLM thoughts and quant model jobs on DGX. Both DGX endpoints return 202
// immediately (the actual work runs async on DGX), so awaiting them
// directly is fast and far more reliable than after() inside mcp-handler.
async function kickoffEnrichment(
  supabase: ServiceSupabase,
  ticker: string,
): Promise<{ thoughts_task?: string; models_task?: string }> {
  await ensureBasicEnrichment(supabase, ticker);
  const [thoughtsRes, modelsRes] = await Promise.allSettled([
    market.generateThoughts(ticker),
    market.runAllModels(ticker),
  ]);
  const out: { thoughts_task?: string; models_task?: string } = {};
  if (thoughtsRes.status === "fulfilled") {
    const r = thoughtsRes.value as { task_id?: string } | null;
    if (r?.task_id) out.thoughts_task = r.task_id;
  } else {
    console.error(`[mcp] generateThoughts ${ticker} failed`, thoughtsRes.reason);
  }
  if (modelsRes.status === "fulfilled") {
    const r = modelsRes.value as { task_id?: string } | null;
    if (r?.task_id) out.models_task = r.task_id;
  } else {
    // 429 "Already run today" is expected — quant models are once-daily.
    const msg = String(modelsRes.reason);
    if (!msg.includes("429")) {
      console.error(`[mcp] runAllModels ${ticker} failed`, modelsRes.reason);
    }
  }
  return out;
}

// Walk a list_watchlists payload, find any ticker that's missing basic
// metadata in stock_catalog OR missing LLM data in llm_analysis, and sync
// them from DGX. Also queues LLM/quant jobs for tickers DGX has nothing
// on yet so subsequent calls have data to pick up.
export async function backfillStaleWatchlistItems(
  supabase: ServiceSupabase,
  rows: Array<Record<string, unknown>>,
): Promise<{ synced: string[]; thoughts_queued: string[] }> {
  const seen = new Map<string, Record<string, unknown>>();
  for (const row of rows ?? []) {
    const items = (row?.watchlist_items as Array<Record<string, unknown>>) ?? [];
    for (const item of items) {
      const stock = (item?.stock_catalog as Record<string, unknown> | null) ?? null;
      const ticker = stock?.ticker as string | undefined;
      if (ticker && !seen.has(ticker)) seen.set(ticker, stock!);
    }
  }
  if (!seen.size) return { synced: [], thoughts_queued: [] };

  const allTickers = [...seen.keys()];
  const { data: existingLlm } = await supabase
    .from("llm_analysis")
    .select("ticker, llm_intrinsic_value, thoughts_summary")
    .in("ticker", allTickers);
  const llmMap = new Map<string, Record<string, unknown>>();
  for (const r of existingLlm ?? [])
    llmMap.set((r as { ticker: string }).ticker, r as Record<string, unknown>);

  const needsSync: string[] = [];
  const needsThoughtsQueue: string[] = [];
  for (const ticker of allTickers) {
    const stock = seen.get(ticker)!;
    const llm = llmMap.get(ticker);
    const missingBasic = !stock.name || stock.last_price == null;
    const missingLlm = !llm || llm.llm_intrinsic_value == null;
    if (missingBasic || missingLlm) needsSync.push(ticker);
    // If neither stock_catalog nor llm_analysis has anything substantive,
    // also queue fresh LLM/quant jobs on DGX.
    if (!llm) needsThoughtsQueue.push(ticker);
  }

  // 1. Sync from DGX (writes both tables).
  await Promise.allSettled(
    needsSync.map((t) => ensureBasicEnrichment(supabase, t)),
  );

  // 2. Queue fresh DGX work for tickers DGX has no LLM data on.
  await Promise.allSettled(
    needsThoughtsQueue.flatMap((t) => [
      market.generateThoughts(t).catch(() => null),
      market.runAllModels(t).catch(() => null),
    ]),
  );

  return { synced: needsSync, thoughts_queued: needsThoughtsQueue };
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
  const t = tickerOf(ticker);
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
      basic: "name/sector/price written to stock_catalog",
      ...enrichment,
      note:
        "AI thoughts and quant models run async on the backend; LLM-derived " +
        "intrinsic value and moat appear in 30-90s. The 'Fair Value' column " +
        "(stock_catalog.intrinsic_value) is filled by a separate DGX worker.",
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
