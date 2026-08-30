"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "./client";
import { stocksApi } from "@/lib/api";

const supabase = createClient();

// Fire-and-forget call to the unified enrichment endpoint. Both watchlist
// add and portfolio add use this; the sweep variant is used by the
// background queries inside useWatchlists / usePortfolioHoldings to
// auto-requeue any rows still stuck in pending.
function kickEnrich(body: { tickers?: string[]; sweep?: boolean }) {
  return fetch("/api/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Auth ────────────────────────────────────────────────────

export function useUser() {
  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Set of the signed-in user's watchlist tickers (uppercase). Empty when logged
 *  out or with no watchlist — callers fall back to showing all names. RLS scopes
 *  watchlist_items to the user through the parent watchlist. */
export function useMyWatchlistTickers() {
  return useQuery({
    queryKey: ["my-watchlist-tickers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlist_items")
        .select("stock_catalog(ticker)");
      const set = new Set<string>();
      if (error) return set;
      for (const it of (data ?? []) as Array<{ stock_catalog?: { ticker?: string } | null }>) {
        const t = it.stock_catalog?.ticker;
        if (t) set.add(t.toUpperCase());
      }
      return set;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** One watchlist with its member tickers — drives the screener watchlist
 *  picklist. Derived from the same nested query useWatchlists uses, so it shares
 *  the RLS scoping (lists + items are owner-scoped). */
export interface WatchlistGroup {
  id: number;
  name: string;
  is_default: boolean;
  tickers: Set<string>;
}

export function useWatchlistGroups() {
  return useQuery({
    queryKey: ["watchlist-groups"],
    queryFn: async (): Promise<WatchlistGroup[]> => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("id, name, is_default, watchlist_items(stock_catalog(ticker))")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) return [];
      return (
        (data ?? []) as Array<{
          id: number;
          name: string;
          is_default: boolean;
          watchlist_items?: Array<{ stock_catalog?: { ticker?: string } | null }> | null;
        }>
      ).map((w) => ({
        id: w.id,
        name: w.name,
        is_default: w.is_default,
        tickers: new Set<string>(
          (w.watchlist_items ?? [])
            .map((it) => it.stock_catalog?.ticker?.toUpperCase())
            .filter((t): t is string => !!t),
        ),
      }));
    },
    staleTime: 60 * 1000,
  });
}

/** Rename a watchlist. RLS scopes the update to the owner. */
export function useRenameWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const clean = name.trim();
      if (!clean) throw new Error("Name required");
      const { error } = await supabase.from("watchlists").update({ name: clean }).eq("id", id);
      if (error) throw new Error(error.message);
      return { id, name: clean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { default_currency?: string; display_name?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

// ── FX rates (proxied from DGX /api/fx/rates) ───────────────

import { fxApi } from "@/lib/api";

export function useFxRates(base: string = "USD") {
  return useQuery({
    queryKey: ["fx-rates", base],
    queryFn: () => fxApi.rates(base),
    staleTime: 15 * 60 * 1000, // refresh at most every 15 min on the client
    gcTime: 60 * 60 * 1000,
  });
}

// ── Watchlists ──────────────────────────────────────────────

export function useWatchlists() {
  const qc = useQueryClient();

  // Background price refresh for all watchlist tickers
  useQuery({
    queryKey: ["watchlist-price-refresh"],
    queryFn: async () => {
      // Get all tickers across all watchlists
      const { data } = await supabase
        .from("watchlist_items")
        .select("stock_catalog(ticker)");
      if (!data?.length) return null;

      const tickers = [...new Set(
        data
          .map((item: any) => item.stock_catalog?.ticker)
          .filter(Boolean)
      )];
      if (!tickers.length) return null;

      await stocksApi.refreshPrices(tickers);
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      return { refreshed: tickers.length, at: Date.now() };
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  // Periodic auto-requeue: any rows still pending (or processing for >10
  // minutes) get re-kicked through DGX. Server-side scoped to this user.
  useQuery({
    queryKey: ["watchlist-enrich-sweep"],
    queryFn: async () => {
      const res = await kickEnrich({ sweep: true });
      if (!res.ok) return null;
      const body = (await res.json()) as { enriched?: string[] };
      if (body.enriched?.length) {
        qc.invalidateQueries({ queryKey: ["watchlists"] });
      }
      return body;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  return useQuery({
    queryKey: ["watchlists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("*, watchlist_items(*, stock_catalog(*))")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useCreateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("watchlists")
        .insert({ user_id: user.id, name, description })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
  });
}

export function useDeleteWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (watchlistId: number) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", watchlistId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
  });
}

// ── Watchlist Items (add/remove stocks) ─────────────────────

export function useAddStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ watchlistId, ticker }: { watchlistId: number; ticker: string }) => {
      const upper = ticker.toUpperCase();
      // Upsert into stock_catalog (shared)
      let { data: stock } = await supabase
        .from("stock_catalog")
        .select("id")
        .eq("ticker", upper)
        .single();

      if (!stock) {
        const { data: newStock, error: insertErr } = await supabase
          .from("stock_catalog")
          .insert({ ticker: upper, enrichment_status: "pending" })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        stock = newStock;
      }

      // Link to watchlist
      const { error } = await supabase
        .from("watchlist_items")
        .insert({ watchlist_id: watchlistId, stock_id: stock!.id });
      if (error) throw error;
      return upper;
    },
    onSuccess: (upper) => {
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      // Trigger DGX enrichment server-side. Fire-and-forget — the sweep
      // query inside useWatchlists will pick it up if this drops.
      void kickEnrich({ tickers: [upper] }).catch(() => null);
    },
  });
}

/** One-click star toggle used by the screener tables (ranked / multibagger /
 *  options). Adds the ticker to the user's default (first) watchlist —
 *  creating "My Watchlist" on first use — or removes it from every list it's
 *  in when already starred. RLS scopes watchlist_items to the user. */
export function useToggleWatchlistTicker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticker: string) => {
      const upper = ticker.toUpperCase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: stock } = await supabase
        .from("stock_catalog")
        .select("id")
        .eq("ticker", upper)
        .maybeSingle();

      // Already starred → remove from all of my lists.
      if (stock) {
        const { data: items } = await supabase
          .from("watchlist_items")
          .select("id")
          .eq("stock_id", stock.id);
        if (items?.length) {
          const { error } = await supabase
            .from("watchlist_items")
            .delete()
            .in("id", items.map((i) => i.id));
          if (error) throw error;
          return { ticker: upper, added: false };
        }
      }

      // Target list: default first, else oldest, else create one.
      const { data: lists } = await supabase
        .from("watchlists")
        .select("id")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      let listId = lists?.[0]?.id as number | undefined;
      if (!listId) {
        const { data: created, error } = await supabase
          .from("watchlists")
          .insert({ user_id: user.id, name: "My Watchlist" })
          .select("id")
          .single();
        if (error) throw error;
        listId = created.id;
      }

      let stockId = stock?.id as number | undefined;
      if (!stockId) {
        const { data: newStock, error } = await supabase
          .from("stock_catalog")
          .insert({ ticker: upper, enrichment_status: "pending" })
          .select("id")
          .single();
        if (error) throw error;
        stockId = newStock.id;
      }

      const { error } = await supabase
        .from("watchlist_items")
        .insert({ watchlist_id: listId, stock_id: stockId });
      if (error) throw error;
      return { ticker: upper, added: true };
    },
    onSuccess: ({ ticker, added }) => {
      qc.invalidateQueries({ queryKey: ["my-watchlist-tickers"] });
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      // New names go through the same DGX enrichment path as the watchlist add.
      if (added) void kickEnrich({ tickers: [ticker] }).catch(() => null);
    },
  });
}

export function useRemoveStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ watchlistId, stockId }: { watchlistId: number; stockId: number }) => {
      const { error } = await supabase
        .from("watchlist_items")
        .delete()
        .eq("watchlist_id", watchlistId)
        .eq("stock_id", stockId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
  });
}

// ── LLM Analysis ──────────────────────────────────────────

export function useLLMAnalysisBatch(tickers: string[]) {
  return useQuery({
    queryKey: ["llm-analysis-batch", tickers.sort().join(",")],
    queryFn: async () => {
      if (!tickers.length) return {};
      const { data, error } = await supabase
        .from("llm_analysis")
        .select("*")
        .in("ticker", tickers);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const row of data || []) {
        map[row.ticker] = row;
      }
      return map;
    },
    enabled: tickers.length > 0,
    staleTime: 60_000,
  });
}

export function useLLMAnalysis(ticker: string) {
  return useQuery({
    queryKey: ["llm-analysis", ticker],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("llm_analysis")
        .select("*")
        .eq("ticker", ticker.toUpperCase())
        .single();
      if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
      return data;
    },
    enabled: !!ticker,
    staleTime: 60_000,
  });
}

// ── Portfolios (containers) ────────────────────────────────

export function usePortfolios() {
  return useQuery({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("portfolios")
        .insert({ user_id: user.id, name, description })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolios"] }),
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (portfolioId: number) => {
      const { error } = await supabase.from("portfolios").delete().eq("id", portfolioId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      qc.invalidateQueries({ queryKey: ["portfolio-holdings"] });
    },
  });
}

// ── Portfolio Holdings ─────────────────────────────────────

export interface HoldingWithPrice {
  id: number;
  ticker: string;
  shares: number;
  cost_basis: number;
  acquired_date: string | null;
  notes: string | null;
  broker: string | null;
  portfolio_id: number;
  currency: string;
  // Joined from stock_catalog
  name?: string;
  current_price?: number;
  last_price_updated_at?: string;
  sector?: string;
}

export function usePortfolioHoldings(portfolioId: number | null) {
  const qc = useQueryClient();

  // Background price refresh — fires once when portfolioId changes
  useQuery({
    queryKey: ["portfolio-price-refresh", portfolioId],
    queryFn: async () => {
      if (!portfolioId) return null;

      // Get tickers from holdings
      const { data: holdings } = await supabase
        .from("portfolio_holdings")
        .select("ticker")
        .eq("portfolio_id", portfolioId);
      if (!holdings?.length) return null;

      const tickers = [...new Set(holdings.map((h: any) => h.ticker))];

      // Fetch live prices from backend (updates Supabase too)
      await stocksApi.refreshPrices(tickers);

      // Invalidate holdings so they re-read fresh prices from Supabase
      qc.invalidateQueries({ queryKey: ["portfolio-holdings", portfolioId] });
      return { refreshed: tickers.length, at: Date.now() };
    },
    enabled: !!portfolioId,
    staleTime: 60_000, // re-trigger every 60s
    refetchInterval: 60_000, // auto-poll every 60s
    refetchIntervalInBackground: false, // pause when tab hidden
  });

  // Auto-requeue stale enrichments while the user has a portfolio open.
  // Same /api/enrich sweep used by useWatchlists — server scopes by user
  // so this picks up holdings (and any watchlist items too).
  useQuery({
    queryKey: ["portfolio-enrich-sweep", portfolioId],
    queryFn: async () => {
      const res = await kickEnrich({ sweep: true });
      if (!res.ok) return null;
      const body = (await res.json()) as { enriched?: string[] };
      if (body.enriched?.length) {
        qc.invalidateQueries({ queryKey: ["portfolio-holdings", portfolioId] });
      }
      return body;
    },
    enabled: !!portfolioId,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  return useQuery({
    queryKey: ["portfolio-holdings", portfolioId],
    queryFn: async (): Promise<HoldingWithPrice[]> => {
      if (!portfolioId) return [];

      // 1. Fetch holdings
      const { data: holdings, error } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!holdings?.length) return [];

      // 2. Fetch prices from stock_catalog
      const tickers = [...new Set(holdings.map((h: any) => h.ticker))];
      const { data: stocks } = await supabase
        .from("stock_catalog")
        .select("ticker, name, last_price, last_price_updated_at, sector")
        .in("ticker", tickers);

      const stockMap: Record<string, any> = {};
      for (const s of stocks || []) {
        stockMap[s.ticker] = s;
      }

      // 3. Merge
      return holdings.map((h: any) => {
        const stock = stockMap[h.ticker];
        return {
          ...h,
          currency: (h.currency || "USD").toUpperCase(),
          name: stock?.name || undefined,
          current_price: stock?.last_price || undefined,
          last_price_updated_at: stock?.last_price_updated_at || undefined,
          sector: stock?.sector || undefined,
        };
      });
    },
    enabled: !!portfolioId,
    staleTime: 30_000,
  });
}

export function useAddHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (holding: {
      ticker: string;
      shares: number;
      cost_basis: number;
      portfolio_id: number;
      acquired_date?: string;
      notes?: string;
      broker?: string;
      currency?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Ensure ticker exists in stock_catalog
      const upperTicker = holding.ticker.toUpperCase();
      const { data: existing } = await supabase
        .from("stock_catalog")
        .select("id")
        .eq("ticker", upperTicker)
        .single();

      if (!existing) {
        await supabase
          .from("stock_catalog")
          .insert({ ticker: upperTicker, enrichment_status: "pending" });
      }

      const { data, error } = await supabase
        .from("portfolio_holdings")
        .insert({
          ticker: upperTicker,
          shares: holding.shares,
          cost_basis: holding.cost_basis,
          portfolio_id: holding.portfolio_id,
          acquired_date: holding.acquired_date || null,
          notes: holding.notes || null,
          broker: holding.broker || null,
          currency: (holding.currency || "USD").toUpperCase(),
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return { data, ticker: upperTicker };
    },
    onSuccess: ({ ticker }) => {
      qc.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      // Same DGX enrichment path the watchlist add uses.
      void kickEnrich({ tickers: [ticker] }).catch(() => null);
    },
  });
}

export function useUpdateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; shares?: number; cost_basis?: number; acquired_date?: string | null; notes?: string | null; broker?: string | null }) => {
      const { error } = await supabase
        .from("portfolio_holdings")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio-holdings"] }),
  });
}

export function useDeleteHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number | number[]) => {
      const idArray = Array.isArray(ids) ? ids : [ids];
      const { error } = await supabase.from("portfolio_holdings").delete().in("id", idArray);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio-holdings"] }),
  });
}

// ── Stock Sales (sell transactions against lots) ───────────

export interface StockSale {
  id: number;
  user_id: string;
  portfolio_id: number;
  holding_id: number | null;
  ticker: string;
  shares_sold: number;
  sale_price: number;
  cost_basis: number;
  realized_pnl: number;
  currency: string;
  sale_date: string | null;
  broker: string | null;
  notes: string | null;
  created_at: string;
}

export function useStockSales(portfolioId: number | null, ticker?: string) {
  return useQuery({
    queryKey: ["stock-sales", portfolioId, ticker ?? null],
    queryFn: async (): Promise<StockSale[]> => {
      if (!portfolioId) return [];
      let q = supabase
        .from("stock_sales")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("sale_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (ticker) q = q.eq("ticker", ticker.toUpperCase());
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!portfolioId,
    staleTime: 30_000,
  });
}

export function useSellLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lot: HoldingWithPrice;
      shares_sold: number;
      sale_price: number;
      sale_date?: string;
      broker?: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { lot, shares_sold, sale_price } = input;
      if (shares_sold <= 0) throw new Error("Shares sold must be positive");
      if (shares_sold > lot.shares + 1e-9) throw new Error("Cannot sell more shares than the lot holds");

      const realized_pnl = (sale_price - lot.cost_basis) * shares_sold;

      const { error: insertErr } = await supabase.from("stock_sales").insert({
        user_id: user.id,
        portfolio_id: lot.portfolio_id,
        holding_id: lot.id,
        ticker: lot.ticker,
        shares_sold,
        sale_price,
        cost_basis: lot.cost_basis,
        realized_pnl,
        currency: (lot.currency || "USD").toUpperCase(),
        sale_date: input.sale_date || null,
        broker: input.broker || lot.broker || null,
        notes: input.notes || null,
      });
      if (insertErr) throw insertErr;

      // Reduce or delete the lot.
      const remaining = lot.shares - shares_sold;
      if (remaining <= 1e-9) {
        const { error } = await supabase.from("portfolio_holdings").delete().eq("id", lot.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("portfolio_holdings")
          .update({ shares: remaining })
          .eq("id", lot.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio-holdings"] });
      qc.invalidateQueries({ queryKey: ["stock-sales"] });
    },
  });
}

// ── Portfolio Analyses (Claude / Gemma risk memos) ─────────

export interface PortfolioAnalysis {
  id: number;
  portfolio_id: number;
  user_id: string;
  provider: "claude" | "gemma";
  model: string | null;
  holdings_snapshot: Array<{
    ticker: string;
    name?: string;
    sector?: string;
    shares: number;
    cost_basis: number;
    current_price?: number;
    mkt_value: number;
    weight_pct: number;
  }>;
  total_value: number | null;
  total_cost: number | null;
  analysis: string;
  summary: Record<string, unknown> | null;
  prompt: string | null;
  error: string | null;
  status: "complete" | "failed";
  created_at: string;
}

export function usePortfolioAnalyses(portfolioId: number | null) {
  return useQuery({
    queryKey: ["portfolio-analyses", portfolioId],
    queryFn: async (): Promise<PortfolioAnalysis[]> => {
      if (!portfolioId) return [];
      const { data, error } = await supabase
        .from("portfolio_analyses")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as PortfolioAnalysis[]) || [];
    },
    enabled: !!portfolioId,
    staleTime: 30_000,
  });
}

export function useSavePortfolioAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      portfolio_id: number;
      provider: "claude" | "gemma";
      model?: string;
      holdings_snapshot: PortfolioAnalysis["holdings_snapshot"];
      total_value: number;
      total_cost: number;
      analysis: string;
      summary?: Record<string, unknown> | null;
      prompt?: string;
      status?: "complete" | "failed";
      error?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("portfolio_analyses")
        .insert({ user_id: user.id, status: "complete", ...payload })
        .select()
        .single();
      if (error) throw error;
      return data as PortfolioAnalysis;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: ["portfolio-analyses", row.portfolio_id] }),
  });
}

export function useDeletePortfolioAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: existing } = await supabase
        .from("portfolio_analyses")
        .select("portfolio_id")
        .eq("id", id)
        .single();
      const { error } = await supabase
        .from("portfolio_analyses")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return existing?.portfolio_id as number | undefined;
    },
    onSuccess: (portfolioId) => {
      qc.invalidateQueries({ queryKey: ["portfolio-analyses", portfolioId] });
    },
  });
}

// ── Notes ───────────────────────────────────────────────────

export function useStockNotes(ticker: string) {
  return useQuery({
    queryKey: ["notes", ticker],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_notes")
        .select("*")
        .eq("ticker", ticker.toUpperCase())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!ticker,
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticker, title, content }: { ticker: string; title?: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("stock_notes")
        .insert({ user_id: user.id, ticker: ticker.toUpperCase(), title, content })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["notes", vars.ticker.toUpperCase()] }),
  });
}

// ── Options trade journal ───────────────────────────────────
//
// The bridge between "the engine recommended this" and "I took it, at this
// fill". Everything else on the desk is either a model's opinion or a paper
// record kept by DGX; this is the only place a real fill is written down, and
// therefore the only place the gap between the mid-price estimates the desk
// quotes and what you actually got will ever become visible.

export type OptionStrategy =
  | "cash_secured_put"
  | "covered_call"
  | "put_credit_spread"
  | "call_credit_spread";

export type TradeStatus = "open" | "closed" | "expired" | "assigned";

export interface OptionsTrade {
  id: number;
  ticker: string;
  strategy: OptionStrategy;
  strike_price: number;
  premium: number;
  contracts: number;
  expiry_date: string;
  entry_date: string;
  underlying_price_at_entry: number | null;
  status: TradeStatus;
  close_date: string | null;
  close_price: number | null;
  underlying_price_at_close: number | null;
  realized_pnl: number | null;
  return_on_capital: number | null;
  annualized_return: number | null;
  outcome_notes: string | null;
  was_profitable: boolean | null;
  created_at: string;
}

export function useOptionsTrades() {
  return useQuery<OptionsTrade[]>({
    queryKey: ["options-trades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("options_trades")
        .select("*")
        .order("status", { ascending: true })
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OptionsTrade[];
    },
    staleTime: 30_000,
  });
}

export function useAddOptionsTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      ticker: string;
      strategy: OptionStrategy;
      strike_price: number;
      premium: number;
      contracts: number;
      expiry_date: string;
      entry_date?: string;
      underlying_price_at_entry?: number | null;
      outcome_notes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("options_trades")
        .insert({
          ...t,
          ticker: t.ticker.toUpperCase(),
          entry_date: t.entry_date || new Date().toISOString().slice(0, 10),
          status: "open",
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options-trades"] }),
  });
}

/**
 * Close a trade and write its outcome.
 *
 * The P&L arithmetic is here rather than in a database trigger so it stays
 * readable next to the rules it encodes, and there are two rules worth being
 * explicit about.
 *
 * A short option that EXPIRES worthless keeps the whole credit. One bought back
 * early keeps the difference. Both are straightforward.
 *
 * ASSIGNMENT IS NOT A WIN, and this is the one that distorts a wheel journal if
 * you let it. The option leg did technically profit — you keep every cent of
 * the premium — but you are now holding shares at a strike the market has moved
 * below. Recording the credit as realised profit would make every assignment
 * look like a success and quietly inflate the win rate of the exact scenario
 * the desk's whole quality gate exists to survive. So an assigned trade records
 * the credit as the option P&L, marks `was_profitable` from the POSITION (spot
 * against the net basis of strike minus premium), and leaves the share leg to
 * the portfolio where it belongs.
 */
export function useCloseOptionsTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: number;
      status: Exclude<TradeStatus, "open">;
      close_date?: string;
      /** Premium paid to buy the contract back. Omit when it expired. */
      close_price?: number | null;
      underlying_price_at_close?: number | null;
      outcome_notes?: string | null;
    }) => {
      const { data: trade, error: readErr } = await supabase
        .from("options_trades")
        .select("*")
        .eq("id", args.id)
        .single();
      if (readErr) throw readErr;

      const t = trade as OptionsTrade;
      const shares = t.contracts * 100;
      const credit = t.premium * shares;
      const paidBack = (args.close_price ?? 0) * shares;

      // The option leg. Assigned and expired both keep the full credit; a
      // buy-back keeps the difference.
      const realized = args.status === "closed" ? credit - paidBack : credit;

      // Capital at risk is the collateral, which is what the return is earned
      // on — not the premium.
      const capital = t.strike_price * shares;
      const closeDate = args.close_date || new Date().toISOString().slice(0, 10);
      const days = Math.max(
        1,
        Math.round(
          (new Date(closeDate).getTime() - new Date(t.entry_date).getTime()) / 86_400_000,
        ),
      );
      const roc = capital > 0 ? realized / capital : null;

      // Assignment is judged on the position, not on the option leg.
      const netBasis = t.strike_price - t.premium;
      const spot = args.underlying_price_at_close ?? null;
      const profitable =
        args.status === "assigned"
          ? spot != null
            ? spot >= netBasis
            : null
          : realized > 0;

      const { data, error } = await supabase
        .from("options_trades")
        .update({
          status: args.status,
          close_date: closeDate,
          close_price: args.close_price ?? null,
          underlying_price_at_close: spot,
          realized_pnl: realized,
          return_on_capital: roc,
          annualized_return: roc != null ? (roc * 365) / days : null,
          was_profitable: profitable,
          outcome_notes: args.outcome_notes ?? t.outcome_notes ?? null,
        })
        .eq("id", args.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options-trades"] }),
  });
}

export function useDeleteOptionsTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("options_trades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options-trades"] }),
  });
}
