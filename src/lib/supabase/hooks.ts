"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "./client";
import { stocksApi } from "@/lib/api";

const supabase = createClient();

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
      // Upsert into stock_catalog (shared)
      let { data: stock } = await supabase
        .from("stock_catalog")
        .select("id")
        .eq("ticker", ticker.toUpperCase())
        .single();

      if (!stock) {
        const { data: newStock, error: insertErr } = await supabase
          .from("stock_catalog")
          .insert({ ticker: ticker.toUpperCase(), enrichment_status: "pending" })
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
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
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
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio-holdings"] }),
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

// ── Options Trades ─────────────────────────────────────────

export interface OptionsTrade {
  id: number;
  user_id: string;
  ticker: string;
  strategy: "cash_secured_put" | "covered_call" | "put_credit_spread" | "call_credit_spread";
  strike_price: number;
  premium: number;
  contracts: number;
  expiry_date: string;
  entry_date: string;
  underlying_price_at_entry: number | null;
  status: "open" | "closed" | "expired" | "assigned";
  close_date: string | null;
  close_price: number | null;
  underlying_price_at_close: number | null;
  realized_pnl: number | null;
  return_on_capital: number | null;
  annualized_return: number | null;
  llm_recommendation: any | null;
  llm_confidence: number | null;
  llm_reasoning: string | null;
  llm_model_version: string | null;
  outcome_notes: string | null;
  was_profitable: boolean | null;
  created_at: string;
  updated_at: string;
}

export function useOptionsTrades(ticker?: string) {
  return useQuery({
    queryKey: ["options-trades", ticker || "all"],
    queryFn: async (): Promise<OptionsTrade[]> => {
      let query = supabase
        .from("options_trades")
        .select("*")
        .order("created_at", { ascending: false });
      if (ticker) query = query.eq("ticker", ticker.toUpperCase());
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useAddOptionsTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trade: {
      ticker: string;
      strategy: OptionsTrade["strategy"];
      strike_price: number;
      premium: number;
      contracts: number;
      expiry_date: string;
      entry_date?: string;
      underlying_price_at_entry?: number;
      llm_recommendation?: any;
      llm_confidence?: number;
      llm_reasoning?: string;
      llm_model_version?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("options_trades")
        .insert({
          ...trade,
          ticker: trade.ticker.toUpperCase(),
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["options-trades", vars.ticker.toUpperCase()] });
      qc.invalidateQueries({ queryKey: ["options-trades", "all"] });
    },
  });
}

function calculateOptionsPnl(trade: {
  strategy: string;
  premium: number;
  contracts: number;
  strike_price: number;
  entry_date: string;
  close_price?: number | null;
  underlying_price_at_close?: number | null;
  status: string;
}) {
  const multiplier = trade.contracts * 100;
  const premiumReceived = trade.premium * multiplier;
  let premiumPaid = 0;

  if (trade.status === "closed" && trade.close_price != null) {
    premiumPaid = trade.close_price * multiplier;
  } else if (trade.status === "assigned" && trade.underlying_price_at_close != null) {
    // For CSP: assigned means we buy at strike, stock is worth underlying_price_at_close
    if (trade.strategy === "cash_secured_put") {
      const assignmentLoss = (trade.strike_price - trade.underlying_price_at_close) * multiplier;
      return {
        realized_pnl: premiumReceived - Math.max(0, assignmentLoss),
        capital_at_risk: trade.strike_price * multiplier,
      };
    }
    // For covered call: called away at strike
    if (trade.strategy === "covered_call") {
      return {
        realized_pnl: premiumReceived,
        capital_at_risk: trade.underlying_price_at_close * multiplier,
      };
    }
  }

  const realized_pnl = premiumReceived - premiumPaid;
  const capital_at_risk = trade.strategy === "cash_secured_put"
    ? trade.strike_price * multiplier
    : (trade.underlying_price_at_close || trade.strike_price) * multiplier;

  return { realized_pnl, capital_at_risk };
}

export function useCloseOptionsTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      close_price,
      underlying_price_at_close,
      status,
      outcome_notes,
    }: {
      id: number;
      close_price?: number;
      underlying_price_at_close?: number;
      status: "closed" | "expired" | "assigned";
      outcome_notes?: string;
    }) => {
      // Fetch existing trade
      const { data: trade, error: fetchErr } = await supabase
        .from("options_trades")
        .select("*")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { realized_pnl, capital_at_risk } = calculateOptionsPnl({
        ...trade,
        close_price: close_price ?? null,
        underlying_price_at_close: underlying_price_at_close ?? trade.underlying_price_at_entry,
        status,
      });

      const entryDate = new Date(trade.entry_date);
      const closeDate = new Date();
      const daysHeld = Math.max(1, Math.round((closeDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
      const return_on_capital = capital_at_risk > 0 ? realized_pnl / capital_at_risk : 0;
      const annualized_return = return_on_capital * (365 / daysHeld);

      const { data, error } = await supabase
        .from("options_trades")
        .update({
          status,
          close_date: closeDate.toISOString().split("T")[0],
          close_price: close_price ?? null,
          underlying_price_at_close: underlying_price_at_close ?? null,
          realized_pnl,
          return_on_capital,
          annualized_return,
          was_profitable: realized_pnl > 0,
          outcome_notes: outcome_notes ?? null,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["options-trades", data.ticker] });
      qc.invalidateQueries({ queryKey: ["options-trades", "all"] });
    },
  });
}

export function useDeleteOptionsTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: trade } = await supabase
        .from("options_trades")
        .select("ticker")
        .eq("id", id)
        .single();
      const { error } = await supabase.from("options_trades").delete().eq("id", id);
      if (error) throw error;
      return trade;
    },
    onSuccess: (trade: any) => {
      if (trade?.ticker) {
        qc.invalidateQueries({ queryKey: ["options-trades", trade.ticker] });
      }
      qc.invalidateQueries({ queryKey: ["options-trades", "all"] });
    },
  });
}

