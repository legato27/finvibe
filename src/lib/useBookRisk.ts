"use client";

/**
 * useBookRisk — the data adapter for `bookRisk.ts`.
 *
 * Joins holdings (one portfolio, or every portfolio the user has) to six
 * months of daily closes per name plus SPY, and to the ranked book's factor
 * scores, then hands the pure module the numbers. Two surfaces read it: the
 * Book risk panel on Portfolio and the one-line clause in the Today call.
 * Both share the query cache, so opening Portfolio after Today costs no
 * second round of history fetches.
 *
 * Values are converted to the profile's default currency before weighting;
 * a lot the FX table cannot convert is left out and counted, never passed
 * through at its native number — a 700 HKD line is not a 700 USD line.
 */
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  useAllHoldings,
  useFxRates,
  usePortfolioHoldings,
  useProfile,
  type HoldingWithPrice,
} from "@/lib/supabase/hooks";
import { modelsApi, stocksApi } from "@/lib/api";
import { convert, inferCurrency, type Currency, type FxRates } from "@/lib/currency";
import { computeBookRisk, logReturns, type BookRisk, type PositionInput } from "@/lib/bookRisk";

export type BookScope = { kind: "portfolio"; id: number | null } | { kind: "all" };

export type BookRiskState = {
  /** `pending` while holdings or any history is still loading. */
  status: "pending" | "empty" | "ready";
  risk: BookRisk | null;
  /** Positions after consolidation, before any history check. */
  names: number;
  /** Positions left out because their currency could not be converted. */
  unconverted: number;
  currency: Currency;
  /** Histories that failed to load — those names count as their own bet. */
  historyErrors: string[];
};

const MARKET = "SPY";
const PERIOD = "6mo";
const INTERVAL = "1d";

type HistoryResponse = { data?: Array<Record<string, unknown>> };

function closesOf(res: HistoryResponse | undefined) {
  if (!res?.data) return [];
  return res.data.map((row) => ({
    time: String(row.Date ?? row.date ?? "").slice(0, 10),
    close: Number(row.Close ?? row.close ?? 0),
  }));
}

/** Consolidate lots into one value per ticker in the reporting currency. */
export function positionsFromHoldings(
  holdings: HoldingWithPrice[] | undefined,
  currency: Currency,
  fx: FxRates | undefined,
): { positions: PositionInput[]; unconverted: number } {
  const map = new Map<string, PositionInput>();
  let unconverted = 0;
  for (const h of holdings ?? []) {
    const native = ((h.currency as Currency) || inferCurrency(h.ticker));
    const price = h.current_price || h.cost_basis;
    const value = convert(h.shares * price, native, currency, fx);
    if (value == null) { unconverted += 1; continue; }
    const t = h.ticker.toUpperCase();
    const cur = map.get(t);
    if (cur) cur.value += value;
    else map.set(t, { ticker: t, value, name: h.name, sector: h.sector });
  }
  return { positions: [...map.values()], unconverted };
}

export function useBookRisk(scope: BookScope, enabled = true): BookRiskState {
  const { data: profile } = useProfile();
  const currency: Currency = (profile?.default_currency as Currency) || "USD";
  const { data: fxRates } = useFxRates(currency);

  const one = usePortfolioHoldings(enabled && scope.kind === "portfolio" ? scope.id : null);
  const all = useAllHoldings(enabled && scope.kind === "all");
  const holdingsQuery = scope.kind === "all" ? all : one;

  const { positions, unconverted } = useMemo(
    () => positionsFromHoldings(holdingsQuery.data, currency, fxRates as FxRates | undefined),
    [holdingsQuery.data, currency, fxRates],
  );

  const tickers = useMemo(() => positions.map((p) => p.ticker).sort(), [positions]);
  const wanted = tickers.length >= 2 ? [...tickers, MARKET] : [];

  const histories = useQueries({
    queries: wanted.map((t) => ({
      queryKey: ["price_history", t, PERIOD, INTERVAL],
      queryFn: () => stocksApi.priceHistory(t, PERIOD, INTERVAL) as Promise<HistoryResponse>,
      staleTime: 10 * 60_000,
      retry: 1,
      enabled,
    })),
  });

  const { data: ranked } = useQuery({
    queryKey: ["cross-sectional-ranked"],
    queryFn: modelsApi.crossSectional,
    staleTime: 30 * 60_000,
    retry: 1,
    enabled: enabled && tickers.length >= 1,
  });

  const anyPending = histories.some((q) => q.isPending);
  // A dependency on the array of results is enough: each entry changes
  // identity when its data lands.
  const historyData = histories.map((q) => q.data);
  const historyErrors = histories.map((q, i) => (q.isError ? wanted[i] : null)).filter((t): t is string => !!t);

  const risk = useMemo(() => {
    if (positions.length < 2 || anyPending) return null;
    const returns: Record<string, Map<string, number>> = {};
    let market: Map<string, number> | undefined;
    wanted.forEach((t, i) => {
      const r = logReturns(closesOf(historyData[i]));
      if (t === MARKET) market = r.size ? r : undefined;
      else if (r.size) returns[t] = r;
    });
    const factors: Record<string, Record<string, number>> = {};
    for (const row of (ranked?.ranked ?? []) as Array<{ ticker: string; factors?: Record<string, number> }>) {
      if (row.factors) factors[row.ticker.toUpperCase()] = row.factors;
    }
    return computeBookRisk({ positions, returns, market, factors });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, anyPending, ranked, ...historyData]);

  if (holdingsQuery.isPending && enabled) {
    return { status: "pending", risk: null, names: 0, unconverted: 0, currency, historyErrors: [] };
  }
  if (positions.length < 2) {
    return { status: "empty", risk: null, names: positions.length, unconverted, currency, historyErrors: [] };
  }
  if (!risk) {
    return { status: "pending", risk: null, names: positions.length, unconverted, currency, historyErrors };
  }
  return { status: "ready", risk, names: positions.length, unconverted, currency, historyErrors };
}
