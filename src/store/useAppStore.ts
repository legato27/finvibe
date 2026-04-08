/**
 * Global Zustand store for app state.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface WatchlistStock {
  id: number;
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
  moat_rating?: "Wide" | "Narrow" | "None";
  moat_confidence?: number;
  intrinsic_value?: number;
  margin_of_safety?: number;
  etf_memberships?: string[];
  ten_yr_low?: number;
  ten_yr_high?: number;
  last_price?: number;
  quarterly_trend?: "up" | "flat" | "down";
  yearly_trend?: "up" | "flat" | "down";
  enrichment_status: string;
  added_at: string;
}

export interface MacroState {
  vix?: {
    current: number;
    change: number;
    change_pct: number;
    zone: string;
    zone_color: string;
    zone_description: string;
    history_30d: Array<{ date: string; close: number }>;
  };
  businessCycle?: {
    state: string;
    probabilities: Record<string, number>;
    indicator_values: Record<string, number>;
  };
  sectorRotation?: Array<{
    sector: string;
    etf_ticker: string;
    perf_1m?: number;
    perf_3m?: number;
    perf_6m?: number;
    perf_12m?: number;
    rs_rank?: number;
  }>;
  swarm?: {
    swarm_score: number;
    signal_type: string;
    signal_description: string;
    n_clusters: number;
    noise_ratio: number;
    largest_cluster_pct: number;
    avg_cluster_density?: number | null;
    density_delta?: number | null;
    n_stocks_analyzed?: number | null;
    top_factors: string[];
    date: string;
  };
}

export interface ActiveModelJob {
  taskId: string;
  ticker: string;
  modelType: string;
  status: "queued" | "running" | "done" | "failed";
  startedAt: number;
}

interface AppState {
  // Watchlist
  watchlist: WatchlistStock[];
  setWatchlist: (stocks: WatchlistStock[]) => void;
  addToWatchlist: (stock: WatchlistStock) => void;
  removeFromWatchlist: (ticker: string) => void;
  updateWatchlistStock: (ticker: string, updates: Partial<WatchlistStock>) => void;

  // Macro
  macro: MacroState;
  setVix: (vix: MacroState["vix"]) => void;
  setBusinessCycle: (cycle: MacroState["businessCycle"]) => void;
  setSectorRotation: (sectors: MacroState["sectorRotation"]) => void;
  setSwarm: (swarm: MacroState["swarm"]) => void;

  // Active model jobs
  activeJobs: ActiveModelJob[];
  addJob: (job: ActiveModelJob) => void;
  updateJobStatus: (taskId: string, status: ActiveModelJob["status"]) => void;
  removeJob: (taskId: string) => void;

  // UI
  selectedTicker: string | null;
  setSelectedTicker: (ticker: string | null) => void;
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // Watchlist
      watchlist: [],
      setWatchlist: (stocks) => set({ watchlist: stocks }),
      addToWatchlist: (stock) =>
        set((state) => ({
          watchlist: [stock, ...state.watchlist.filter((s) => s.ticker !== stock.ticker)],
        })),
      removeFromWatchlist: (ticker) =>
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s.ticker !== ticker),
        })),
      updateWatchlistStock: (ticker, updates) =>
        set((state) => ({
          watchlist: state.watchlist.map((s) =>
            s.ticker === ticker ? { ...s, ...updates } : s
          ),
        })),

      // Macro
      macro: {},
      setVix: (vix) => set((state) => ({ macro: { ...state.macro, vix } })),
      setBusinessCycle: (businessCycle) =>
        set((state) => ({ macro: { ...state.macro, businessCycle } })),
      setSectorRotation: (sectorRotation) =>
        set((state) => ({ macro: { ...state.macro, sectorRotation } })),
      setSwarm: (swarm) => set((state) => ({ macro: { ...state.macro, swarm } })),

      // Jobs
      activeJobs: [],
      addJob: (job) =>
        set((state) => ({ activeJobs: [...state.activeJobs, job] })),
      updateJobStatus: (taskId, status) =>
        set((state) => ({
          activeJobs: state.activeJobs.map((j) =>
            j.taskId === taskId ? { ...j, status } : j
          ),
        })),
      removeJob: (taskId) =>
        set((state) => ({
          activeJobs: state.activeJobs.filter((j) => j.taskId !== taskId),
        })),

      // UI
      selectedTicker: null,
      setSelectedTicker: (ticker) => set({ selectedTicker: ticker }),
      wsConnected: false,
      setWsConnected: (connected) => set({ wsConnected: connected }),
    }),
    { name: "StockResearchStore" }
  )
);
