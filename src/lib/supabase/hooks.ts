"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "./client";

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

// ── Portfolio ───────────────────────────────────────────────

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
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
      acquired_date?: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("portfolio_holdings")
        .insert({ ...holding, ticker: holding.ticker.toUpperCase(), user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });
}

export function useUpdateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; shares?: number; cost_basis?: number; notes?: string }) => {
      const { error } = await supabase
        .from("portfolio_holdings")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });
}

export function useDeleteHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("portfolio_holdings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
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
