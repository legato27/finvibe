"use client";
import { useQuery } from "@tanstack/react-query";
import { stocksApi } from "@/lib/api";
import { Calendar, TrendingUp, DollarSign, Clock, AlertCircle, Loader2 } from "lucide-react";

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CountdownBadge({ days }: { days: number }) {
  const urgent = days <= 14;
  const soon = days <= 30;
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
      urgent ? "bg-orange-500/20 text-orange-400" :
      soon   ? "bg-yellow-500/20 text-yellow-400" :
               "bg-muted text-muted-foreground"
    }`}>
      {days === 0 ? "Today" : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`}
    </span>
  );
}

export function StockEvents({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stock-events", ticker],
    queryFn: () => stocksApi.events(ticker),
    staleTime: 60 * 60 * 1000, // 1hr — events don't change often
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="card p-6 text-center text-muted-foreground text-sm">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Could not load events for {ticker}
      </div>
    );
  }

  const earningsDays = daysUntil(data?.earnings_date);
  const exDivDays = daysUntil(data?.ex_dividend_date);
  const divDays = daysUntil(data?.dividend_date);

  const hasEarnings = data?.earnings_date != null;
  const hasDividend = data?.dividend_rate || data?.dividend_yield;
  const hasExDiv = data?.ex_dividend_date != null;

  return (
    <div className="space-y-3">
      {/* Earnings */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Earnings</span>
        </div>
        {hasEarnings ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Next Earnings Date</div>
                <div className="text-sm font-mono font-semibold">
                  {formatDate(data.earnings_date)}
                  {data.earnings_date_end && data.earnings_date_end !== data.earnings_date && (
                    <span className="text-muted-foreground font-normal"> – {formatDate(data.earnings_date_end)}</span>
                  )}
                </div>
              </div>
              {earningsDays != null && <CountdownBadge days={earningsDays} />}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/20">
              {data?.eps_estimate != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">EPS Est.</div>
                  <div className="text-sm font-mono">${data.eps_estimate.toFixed(2)}</div>
                </div>
              )}
              {data?.eps_trailing != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">EPS TTM</div>
                  <div className="text-sm font-mono">${data.eps_trailing.toFixed(2)}</div>
                </div>
              )}
              {data?.pe_forward != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Fwd P/E</div>
                  <div className="text-sm font-mono">{data.pe_forward.toFixed(1)}x</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No upcoming earnings date available</div>
        )}
      </div>

      {/* Dividends */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold">Dividends</span>
        </div>
        {hasDividend ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data?.dividend_rate != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Annual Rate</div>
                  <div className="text-sm font-mono font-semibold text-green-400">${data.dividend_rate.toFixed(2)}</div>
                </div>
              )}
              {data?.dividend_yield != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Yield</div>
                  <div className="text-sm font-mono font-semibold text-green-400">
                    {(data.dividend_yield * 100).toFixed(2)}%
                  </div>
                </div>
              )}
              {data?.five_year_avg_dividend_yield != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">5yr Avg Yield</div>
                  <div className="text-sm font-mono">{data.five_year_avg_dividend_yield.toFixed(2)}%</div>
                </div>
              )}
              {data?.payout_ratio != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Payout Ratio</div>
                  <div className="text-sm font-mono">{(data.payout_ratio * 100).toFixed(0)}%</div>
                </div>
              )}
            </div>
            {(hasExDiv || data?.dividend_date) && (
              <div className="pt-2 border-t border-border/20 space-y-2">
                {hasExDiv && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Ex-Dividend Date</div>
                      <div className="text-sm font-mono">{formatDate(data.ex_dividend_date)}</div>
                    </div>
                    {exDivDays != null && <CountdownBadge days={exDivDays} />}
                  </div>
                )}
                {data?.dividend_date && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Payment Date</div>
                      <div className="text-sm font-mono">{formatDate(data.dividend_date)}</div>
                    </div>
                    {divDays != null && <CountdownBadge days={divDays} />}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No dividend information available</div>
        )}
      </div>
    </div>
  );
}
