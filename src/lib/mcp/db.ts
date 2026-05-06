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

// How long we let a row sit without a `name` from DGX before giving up
// and marking it 'failed'. Most successful enrichments populate `name` on
// the first /detail call; if DGX still has nothing 30 minutes after the
// row was created, the ticker is almost certainly one DGX can't resolve
// (delisted, exchange not covered, malformed input).
const NO_DATA_GIVEUP_MIN = 30;

// Pull DGX's full view of a ticker (stock_catalog basics + LLM sub-object)
// and mirror it into Supabase ourselves. DGX has its own enrichment worker
// that eventually syncs to Supabase, but timing is unreliable — this puts
// MCP in the driver's seat so the watchlist UI shows what DGX knows.
//
// Status promotion (own this column locally, don't wait on DGX):
//   - DGX returned an explicit non-pending status → mirror it.
//   - basic data landed (name) AND LLM analysis has substantive content
//     (thoughts_summary or llm_intrinsic_value) → done.
//   - basic data landed but LLM analysis is still empty → processing.
//   - DGX returned nothing usable AND row is older than NO_DATA_GIVEUP_MIN
//     → failed (so the UI can surface "no data" and the sweep stops looping).
//   - DGX 404'd the ticker → failed immediately.
//   - DGX returned nothing usable but row is still young → leave as-is so
//     a future sweep retries.
export async function ensureBasicEnrichment(
  supabase: ServiceSupabase,
  ticker: string,
): Promise<{ basic_fields: string[]; llm_fields: string[]; status?: string }> {
  const result = {
    basic_fields: [] as string[],
    llm_fields: [] as string[],
    status: undefined as string | undefined,
  };
  // Snapshot the current row so we can decide whether "DGX returned nothing"
  // means "give up" or "wait a bit longer".
  const { data: existing } = await supabase
    .from("stock_catalog")
    .select("name, created_at")
    .eq("ticker", ticker)
    .maybeSingle();
  const isOldEnoughToGiveUp =
    !!existing?.created_at &&
    Date.now() - new Date(existing.created_at).getTime() >
      NO_DATA_GIVEUP_MIN * 60_000;

  try {
    const detail = (await market.detail(ticker)) as Record<string, unknown> | null;
    if (!detail) {
      if (isOldEnoughToGiveUp && !existing?.name) {
        await markFailed(supabase, ticker);
        result.status = "failed";
      }
      return result;
    }

    // 1. Build stock_catalog patch from whatever DGX has populated.
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

    // 2. Upsert llm_analysis from the nested `llm` object if DGX has any.
    //    Done before the status decision so we know whether substantive LLM
    //    data is now present in the DB.
    let llmHasSubstance = false;
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
          llmHasSubstance =
            llmPatch.thoughts_summary != null ||
            llmPatch.llm_intrinsic_value != null;
        }
      }
    }

    // If DGX hasn't already promoted basic data on its own, also check the
    // existing llm_analysis row — we may have flipped it in a prior call.
    if (!llmHasSubstance) {
      const { data: existingLlm } = await supabase
        .from("llm_analysis")
        .select("thoughts_summary, llm_intrinsic_value")
        .eq("ticker", ticker)
        .maybeSingle();
      llmHasSubstance =
        !!existingLlm &&
        (existingLlm.thoughts_summary != null ||
          existingLlm.llm_intrinsic_value != null);
    }

    // 3. Decide enrichment_status to write.
    let nextStatus: string | undefined;
    if (
      typeof detail.enrichment_status === "string" &&
      detail.enrichment_status !== "pending"
    ) {
      nextStatus = detail.enrichment_status;
    } else if (stockPatch.name) {
      nextStatus = llmHasSubstance ? "done" : "processing";
    } else if (isOldEnoughToGiveUp && !existing?.name) {
      // DGX responded but had nothing useful (no name, ever) and we've
      // given it long enough — stop cycling and surface "no data" to the
      // user rather than a perpetual "enriching" pill.
      nextStatus = "failed";
    }
    if (nextStatus) {
      stockPatch.enrichment_status = nextStatus;
      result.status = nextStatus;
    }

    // 4. Persist the stock_catalog patch (only if we actually have changes).
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
  } catch (err) {
    // 404 = DGX has positively confirmed it doesn't recognise this ticker.
    // Mark failed straight away so the UI stops showing "enriching" and
    // the sweep stops re-kicking it forever.
    const msg = String(err);
    if (/\b404\b/.test(msg)) {
      await markFailed(supabase, ticker);
      result.status = "failed";
    }
    console.error(`[mcp] ensureBasicEnrichment ${ticker} failed`, err);
  }
  return result;
}

async function markFailed(supabase: ServiceSupabase, ticker: string) {
  const { error } = await supabase
    .from("stock_catalog")
    .update({ enrichment_status: "failed" })
    .eq("ticker", ticker);
  if (error) console.error(`[mcp] markFailed ${ticker}:`, error);
}

// Synchronously populate name/sector/price into stock_catalog (so the
// watchlist UI shows data immediately on next read), then queue the
// LLM thoughts and quant model jobs on DGX. Both DGX endpoints return 202
// immediately (the actual work runs async on DGX), so awaiting them
// directly is fast and far more reliable than after() inside mcp-handler.
export async function kickoffEnrichment(
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
