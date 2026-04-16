"use client";
import { useState } from "react";
import Link from "next/link";
import {
  DollarSign, BookOpen, Clock, Check, X, Loader2, Trash2,
  AlertTriangle, TrendingUp, TrendingDown, Filter, ArrowUpDown,
} from "lucide-react";
import {
  useOptionsTrades,
  useCloseOptionsTrade,
  useDeleteOptionsTrade,
  OptionsTrade,
} from "@/lib/supabase/hooks";

// ── Close Trade Modal ───────────────────────────────────────

function CloseTradeModal({
  trade,
  onClose,
  onConfirm,
  isClosing,
}: {
  trade: OptionsTrade;
  onClose: () => void;
  onConfirm: (data: {
    close_price?: number;
    underlying_price_at_close?: number;
    status: "closed" | "expired" | "assigned";
    outcome_notes?: string;
  }) => void;
  isClosing: boolean;
}) {
  const [closeType, setCloseType] = useState<"closed" | "expired" | "assigned">("closed");
  const [closePrice, setClosePrice] = useState("");
  const [underlyingPrice, setUnderlyingPrice] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-5 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">
            Close Trade — {trade.ticker} ${trade.strike_price}{" "}
            {trade.strategy === "cash_secured_put" ? "P" : "C"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
            How was it closed?
          </label>
          <div className="flex gap-2">
            {(["closed", "expired", "assigned"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCloseType(t)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  closeType === t
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-accent/30 text-muted-foreground border-border/30 hover:bg-accent/50"
                }`}
              >
                {t === "closed" ? "Bought Back" : t === "expired" ? "Expired Worthless" : "Assigned"}
              </button>
            ))}
          </div>
        </div>

        {closeType === "closed" && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
              Buy-back Premium (per share)
            </label>
            <input
              type="number"
              step="0.01"
              value={closePrice}
              onChange={(e) => setClosePrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
        )}

        {closeType === "assigned" && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
              Stock Price at Assignment
            </label>
            <input
              type="number"
              step="0.01"
              value={underlyingPrice}
              onChange={(e) => setUnderlyingPrice(e.target.value)}
              placeholder={trade.underlying_price_at_entry?.toFixed(2) || "0.00"}
              className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
        )}

        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
            Outcome Notes (for fine-tuning)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened? Was the thesis correct?"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-xs focus:outline-none focus:border-primary/50 resize-none"
          />
        </div>

        <div className="bg-accent/20 rounded-lg p-3 text-xs">
          <span className="text-muted-foreground">Premium received: </span>
          <span className="font-mono text-green-400">
            ${(trade.premium * trade.contracts * 100).toFixed(2)}
          </span>
          {closeType === "closed" && closePrice && (
            <>
              <br />
              <span className="text-muted-foreground">Buy-back cost: </span>
              <span className="font-mono text-red-400">
                ${(parseFloat(closePrice) * trade.contracts * 100).toFixed(2)}
              </span>
              <br />
              <span className="text-muted-foreground">Net P&L: </span>
              <span
                className={`font-mono ${
                  trade.premium - parseFloat(closePrice) >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ${((trade.premium - parseFloat(closePrice)) * trade.contracts * 100).toFixed(2)}
              </span>
            </>
          )}
          {closeType === "expired" && (
            <>
              <br />
              <span className="text-muted-foreground">Net P&L: </span>
              <span className="font-mono text-green-400">
                ${(trade.premium * trade.contracts * 100).toFixed(2)} (max profit)
              </span>
            </>
          )}
        </div>

        <button
          onClick={() =>
            onConfirm({
              close_price:
                closeType === "closed"
                  ? parseFloat(closePrice) || 0
                  : closeType === "expired"
                  ? 0
                  : undefined,
              underlying_price_at_close:
                closeType === "assigned" ? parseFloat(underlyingPrice) || undefined : undefined,
              status: closeType,
              outcome_notes: notes || undefined,
            })
          }
          disabled={isClosing || (closeType === "closed" && !closePrice)}
          className="w-full px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isClosing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {isClosing ? "Closing..." : "Confirm Close"}
        </button>
      </div>
    </div>
  );
}

// ── Trade Row ───────────────────────────────────────────────

function TradeRow({
  trade,
  onClose,
  onDelete,
}: {
  trade: OptionsTrade;
  onClose: (trade: OptionsTrade) => void;
  onDelete: (id: number) => void;
}) {
  const isOpen = trade.status === "open";
  const isCSP = trade.strategy === "cash_secured_put";
  const daysToExpiry = isOpen
    ? Math.max(
        0,
        Math.round(
          (new Date(trade.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;
  const isExpiring = isOpen && daysToExpiry <= 7;
  const isExpired = isOpen && daysToExpiry <= 0;

  return (
    <div
      className={`border rounded-lg p-4 ${
        isOpen
          ? "border-border/30"
          : trade.was_profitable
          ? "border-green-500/20 bg-green-500/5"
          : "border-red-500/20 bg-red-500/5"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
              isCSP ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
            }`}
          >
            {isCSP ? "CSP" : "CC"}
          </span>
          <Link
            href={`/stock/${trade.ticker}`}
            className="font-mono text-sm font-bold text-primary hover:underline"
          >
            {trade.ticker}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">
            ${trade.strike_price.toFixed(2)} {isCSP ? "P" : "C"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded ${
                isExpired
                  ? "bg-red-500/15 text-red-400 animate-pulse"
                  : isExpiring
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-green-500/15 text-green-400"
              }`}
            >
              {isExpired ? "EXPIRED" : isExpiring ? `${daysToExpiry}d left` : `${daysToExpiry}d`}
            </span>
          )}
          <span
            className={`text-[10px] px-2 py-0.5 rounded uppercase ${
              isOpen
                ? "bg-blue-500/15 text-blue-400"
                : trade.status === "expired"
                ? "bg-green-500/15 text-green-400"
                : trade.status === "assigned"
                ? "bg-amber-500/15 text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {trade.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-center">
        <div>
          <div className="text-[9px] text-muted-foreground">Entry Price</div>
          <div className="font-mono text-xs">
            {trade.underlying_price_at_entry
              ? `$${trade.underlying_price_at_entry.toFixed(2)}`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">Premium</div>
          <div className="font-mono text-xs text-green-400">${trade.premium.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">
            {trade.contracts}x Contract{trade.contracts > 1 ? "s" : ""}
          </div>
          <div className="font-mono text-xs">
            ${(trade.premium * trade.contracts * 100).toFixed(0)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">Expiry</div>
          <div className="font-mono text-xs">
            {new Date(trade.expiry_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "2-digit",
            })}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">P&L</div>
          {trade.realized_pnl != null ? (
            <div
              className={`font-mono text-xs font-bold ${
                trade.realized_pnl >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {trade.realized_pnl >= 0 ? "+" : ""}${trade.realized_pnl.toFixed(0)}
              {trade.return_on_capital != null && (
                <span className="text-[9px] ml-0.5">
                  ({(trade.return_on_capital * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          ) : (
            <div className="font-mono text-xs text-muted-foreground">—</div>
          )}
        </div>
      </div>

      {/* Entry date + AI confidence */}
      <div className="flex items-center gap-4 mt-2">
        <div className="text-[9px] text-muted-foreground">
          Opened:{" "}
          {new Date(trade.entry_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
        {trade.llm_confidence != null && (
          <div className="flex items-center gap-2 flex-1">
            <div className="text-[9px] text-muted-foreground">AI:</div>
            <div className="flex-1 bg-accent/30 rounded-full h-1.5 max-w-[100px]">
              <div
                className={`h-1.5 rounded-full ${
                  trade.llm_confidence >= 0.7
                    ? "bg-green-400"
                    : trade.llm_confidence >= 0.5
                    ? "bg-yellow-400"
                    : "bg-red-400"
                }`}
                style={{ width: `${trade.llm_confidence * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono">
              {(trade.llm_confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
        {trade.annualized_return != null && (
          <div className="text-[9px] text-muted-foreground">
            Ann:{" "}
            <span
              className={`font-mono ${
                trade.annualized_return >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {(trade.annualized_return * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Outcome Notes */}
      {trade.outcome_notes && (
        <div className="mt-2 text-[9px] text-muted-foreground bg-accent/20 rounded px-2 py-1">
          <span className="font-semibold">Notes:</span> {trade.outcome_notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/20">
        {isOpen && (
          <button
            onClick={() => onClose(trade)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-semibold bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Close Trade
          </button>
        )}
        <Link
          href={`/stock/${trade.ticker}`}
          className="flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-colors"
        >
          View Stock
        </Link>
        <button
          onClick={() => onDelete(trade.id)}
          className="px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Filters ─────────────────────────────────────────────────

type StatusFilter = "all" | "open" | "closed" | "expired" | "assigned";
type StrategyFilter = "all" | "cash_secured_put" | "covered_call";
type SortField = "date" | "ticker" | "pnl" | "expiry";

// ── Main Page ───────────────────────────────────────────────

export default function TradesPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [closingTrade, setClosingTrade] = useState<OptionsTrade | null>(null);

  // Fetch ALL trades (no ticker filter)
  const { data: allTrades = [], isLoading } = useOptionsTrades();
  const closeTrade = useCloseOptionsTrade();
  const deleteTrade = useDeleteOptionsTrade();

  // Apply filters
  let filtered = allTrades.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (strategyFilter !== "all" && t.strategy !== strategyFilter) return false;
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "date":
        cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        break;
      case "ticker":
        cmp = a.ticker.localeCompare(b.ticker);
        break;
      case "pnl":
        cmp = (b.realized_pnl || 0) - (a.realized_pnl || 0);
        break;
      case "expiry":
        cmp = new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        break;
    }
    return sortAsc ? -cmp : cmp;
  });

  const openTrades = allTrades.filter((t) => t.status === "open");
  const closedTrades = allTrades.filter((t) => t.status !== "open");

  // Stats
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  const totalPremiumCollected = allTrades.reduce(
    (sum, t) => sum + t.premium * t.contracts * 100,
    0
  );
  const winRate =
    closedTrades.length > 0
      ? ((closedTrades.filter((t) => t.was_profitable).length / closedTrades.length) * 100).toFixed(
          0
        )
      : null;
  const avgReturn =
    closedTrades.length > 0
      ? (
          (closedTrades.reduce((sum, t) => sum + (t.return_on_capital || 0), 0) /
            closedTrades.length) *
          100
        ).toFixed(1)
      : null;
  const avgAnnualized =
    closedTrades.length > 0
      ? (
          (closedTrades.reduce((sum, t) => sum + (t.annualized_return || 0), 0) /
            closedTrades.length) *
          100
        ).toFixed(1)
      : null;

  // Unique tickers
  const tickers = [...new Set(allTrades.map((t) => t.ticker))];
  const expiringCount = openTrades.filter((t) => {
    const dte = Math.max(
      0,
      Math.round((new Date(t.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );
    return dte <= 7;
  }).length;

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  async function handleCloseTrade(data: {
    close_price?: number;
    underlying_price_at_close?: number;
    status: "closed" | "expired" | "assigned";
    outcome_notes?: string;
  }) {
    if (!closingTrade) return;
    try {
      await closeTrade.mutateAsync({ id: closingTrade.id, ...data });
      setClosingTrade(null);
    } catch (err) {
      console.error("Failed to close trade:", err);
    }
  }

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Trade Journal</h1>
            <p className="text-xs text-muted-foreground">
              Options trades across all tickers · {allTrades.length} total ·{" "}
              {tickers.length} ticker{tickers.length !== 1 ? "s" : ""}
            </p>
          </div>
          {expiringCount > 0 && (
            <span className="ml-auto text-[10px] bg-amber-500/15 text-amber-400 px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {expiringCount} expiring soon
            </span>
          )}
        </div>

        {/* Stats */}
        {allTrades.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Open</div>
              <div className="font-mono text-sm font-bold text-blue-400">
                {openTrades.length}
              </div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Closed</div>
              <div className="font-mono text-sm font-bold">{closedTrades.length}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Total P&L</div>
              <div
                className={`font-mono text-sm font-bold ${
                  totalPnl >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}
              </div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Premium</div>
              <div className="font-mono text-sm font-bold text-green-400">
                ${totalPremiumCollected.toFixed(0)}
              </div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Win Rate</div>
              <div className="font-mono text-sm font-bold">{winRate ? `${winRate}%` : "—"}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Avg Return</div>
              <div className="font-mono text-sm font-bold">
                {avgReturn ? `${avgReturn}%` : "—"}
              </div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Avg Ann.</div>
              <div className="font-mono text-sm font-bold">
                {avgAnnualized ? `${avgAnnualized}%` : "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters & Sort */}
      <div className="card px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase">Status:</span>
            <div className="flex gap-1">
              {(["all", "open", "closed", "expired", "assigned"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-border/30" />

          {/* Strategy Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase">Strategy:</span>
            <div className="flex gap-1">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "cash_secured_put", label: "CSP" },
                  { value: "covered_call", label: "CC" },
                ] as { value: StrategyFilter; label: string }[]
              ).map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStrategyFilter(s.value)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    strategyFilter === s.value
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-border/30" />

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase">Sort:</span>
            <div className="flex gap-1">
              {(
                [
                  { value: "date", label: "Date" },
                  { value: "ticker", label: "Ticker" },
                  { value: "expiry", label: "Expiry" },
                  { value: "pnl", label: "P&L" },
                ] as { value: SortField; label: string }[]
              ).map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleSort(s.value)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    sortField === s.value
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {s.label}
                  {sortField === s.value && (
                    <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card p-10 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && allTrades.length === 0 && (
        <div className="card p-12 text-center text-muted-foreground">
          <BookOpen className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">No trades yet</p>
          <p className="text-xs mt-2 max-w-md mx-auto">
            Go to any stock&apos;s{" "}
            <span className="text-primary font-medium">Options</span> tab to view
            AI-generated Cash Secured Put and Covered Call recommendations, then click
            &quot;Add to Trade Journal&quot; to start tracking.
          </p>
        </div>
      )}

      {/* No Results After Filter */}
      {!isLoading && allTrades.length > 0 && filtered.length === 0 && (
        <div className="card p-8 text-center text-muted-foreground">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No trades match the current filters.</p>
        </div>
      )}

      {/* Trade List */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] text-muted-foreground px-1">
            Showing {filtered.length} of {allTrades.length} trades
          </div>
          {filtered.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              onClose={setClosingTrade}
              onDelete={(id) => deleteTrade.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Close Trade Modal */}
      {closingTrade && (
        <CloseTradeModal
          trade={closingTrade}
          onClose={() => setClosingTrade(null)}
          onConfirm={handleCloseTrade}
          isClosing={closeTrade.isPending}
        />
      )}
    </div>
  );
}
