"use client";

/**
 * useTrackRecord — the data adapter for `trackRecord.ts`.
 *
 * Journal trades from Supabase, the engine's strategy log per traded name,
 * two years of daily closes for names with an early-closed trade (to price
 * the hold-to-expiry counterfactual), and the engine's own scorecard for
 * the comparison. Everything is cached; the scorecard query is the one the
 * desk's engine panel already holds.
 */
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { modelsApi, optionsApi, stocksApi } from "@/lib/api";
import { useOptionsTrades, useUser } from "@/lib/supabase/hooks";
import { cohorts, gradeTrades, summarize, type Cohorts, type GradedTrade, type LogRow, type Summary, type TradeInput } from "@/lib/trackRecord";

export type ScoreBlock = {
  n: number;
  win_rate: number;
  avg_captured_pct: number;
  avg_annualized_pct: number;
  assignment_rate: number;
  mean_pop_pred: number;
  calibration_gap: number;
};
export type Scorecard = {
  window_days: number;
  overall: ScoreBlock;
  by_strategy: Record<string, ScoreBlock>;
  by_agreement: Record<string, ScoreBlock>;
  by_dte: Record<string, ScoreBlock>;
};

export type TrackRecordState = {
  status: "pending" | "signed_out" | "ready";
  graded: GradedTrade[];
  cohorts: Cohorts | null;
  summary: Summary | null;
  engine: Scorecard | null;
  openCount: number;
};

type LogResponse = { rows?: LogRow[] };
type HistoryResponse = { data?: Array<Record<string, unknown>> };

/** The close on the expiry date, or the last close up to five days before it. */
function closeOn(res: HistoryResponse | undefined, date: string): number | null {
  if (!res?.data) return null;
  let best: { time: string; close: number } | null = null;
  for (const row of res.data) {
    const time = String(row.Date ?? row.date ?? "").slice(0, 10);
    const close = Number(row.Close ?? row.close ?? 0);
    if (!time || !(close > 0) || time > date) continue;
    if (!best || time > best.time) best = { time, close };
  }
  if (!best) return null;
  const gap = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${best.time}T00:00:00Z`)) / 86_400_000;
  return gap <= 5 ? best.close : null;
}

export function useTrackRecord(enabled = true): TrackRecordState {
  const { data: user, isPending: userPending } = useUser();
  const trades = useOptionsTrades();
  const settled = useMemo(() => (trades.data ?? []).filter((t) => t.status !== "open") as TradeInput[], [trades.data]);
  const openCount = (trades.data ?? []).filter((t) => t.status === "open").length;

  const tickers = useMemo(() => [...new Set(settled.map((t) => t.ticker.toUpperCase()))].sort(), [settled]);
  const closedTickers = useMemo(
    () => [...new Set(settled.filter((t) => t.status === "closed").map((t) => t.ticker.toUpperCase()))].sort(),
    [settled],
  );

  const logs = useQueries({
    queries: tickers.map((tk) => ({
      queryKey: ["strategy-log", tk, 200],
      queryFn: () => optionsApi.strategyLog(tk, 200) as Promise<LogResponse>,
      staleTime: 60 * 60_000,
      retry: 1,
      enabled: enabled && !!user,
    })),
  });
  const histories = useQueries({
    queries: closedTickers.map((tk) => ({
      queryKey: ["price_history", tk, "2y", "1d"],
      queryFn: () => stocksApi.priceHistory(tk, "2y", "1d") as Promise<HistoryResponse>,
      staleTime: 60 * 60_000,
      retry: 1,
      enabled: enabled && !!user,
    })),
  });
  const { data: engine } = useQuery<Scorecard>({
    queryKey: ["options-reco-scorecard", 400],
    queryFn: () => modelsApi.optionsRecoScorecard(400),
    staleTime: 60 * 60_000,
    retry: 1,
    enabled,
  });

  const logsPending = logs.some((q) => q.isPending);
  const histPending = histories.some((q) => q.isPending);
  const logData = logs.map((q) => q.data);
  const histData = histories.map((q) => q.data);

  const graded = useMemo(() => {
    if (logsPending || histPending) return null;
    const byTicker: Record<string, LogRow[]> = {};
    tickers.forEach((tk, i) => { byTicker[tk] = logData[i]?.rows ?? []; });
    const closes: Record<string, number> = {};
    for (const t of settled) {
      if (t.status !== "closed") continue;
      const tk = t.ticker.toUpperCase();
      const c = closeOn(histData[closedTickers.indexOf(tk)], t.expiry_date.slice(0, 10));
      if (c != null) closes[`${tk}|${t.expiry_date.slice(0, 10)}`] = c;
    }
    return gradeTrades(settled, byTicker, closes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, tickers, closedTickers, logsPending, histPending, ...logData, ...histData]);

  if (userPending) return { status: "pending", graded: [], cohorts: null, summary: null, engine: engine ?? null, openCount: 0 };
  if (!user) return { status: "signed_out", graded: [], cohorts: null, summary: null, engine: engine ?? null, openCount: 0 };
  if (trades.isPending || !graded) return { status: "pending", graded: [], cohorts: null, summary: null, engine: engine ?? null, openCount };
  return { status: "ready", graded, cohorts: cohorts(graded), summary: summarize(graded), engine: engine ?? null, openCount };
}
