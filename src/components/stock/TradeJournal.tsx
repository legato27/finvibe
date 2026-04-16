"use client";
import { useState } from "react";
import {
  BookOpen, Clock, Check, X, Loader2, Trash2, AlertTriangle,
  TrendingUp, TrendingDown, DollarSign, Shield, Calendar,
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
  onConfirm: (data: { close_price?: number; underlying_price_at_close?: number; status: "closed" | "expired" | "assigned"; outcome_notes?: string }) => void;
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
          <h3 className="text-sm font-bold">Close Trade — {trade.ticker} ${trade.strike_price} {trade.strategy === "cash_secured_put" ? "P" : "C"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Close Type */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">How was it closed?</label>
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

        {/* Close Price (for buy-back) */}
        {closeType === "closed" && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Buy-back Premium (per share)</label>
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

        {/* Underlying Price at Close */}
        {closeType === "assigned" && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Stock Price at Assignment</label>
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

        {/* Notes */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Outcome Notes (for fine-tuning)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened? Was the thesis correct?"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-accent/30 border border-border/30 text-xs focus:outline-none focus:border-primary/50 resize-none"
          />
        </div>

        {/* Preview */}
        <div className="bg-accent/20 rounded-lg p-3 text-xs">
          <span className="text-muted-foreground">Premium received: </span>
          <span className="font-mono text-green-400">${(trade.premium * trade.contracts * 100).toFixed(2)}</span>
          {closeType === "closed" && closePrice && (
            <>
              <br />
              <span className="text-muted-foreground">Buy-back cost: </span>
              <span className="font-mono text-red-400">${(parseFloat(closePrice) * trade.contracts * 100).toFixed(2)}</span>
              <br />
              <span className="text-muted-foreground">Net P&L: </span>
              <span className={`font-mono ${(trade.premium - parseFloat(closePrice)) >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${((trade.premium - parseFloat(closePrice)) * trade.contracts * 100).toFixed(2)}
              </span>
            </>
          )}
          {closeType === "expired" && (
            <>
              <br />
              <span className="text-muted-foreground">Net P&L: </span>
              <span className="font-mono text-green-400">${(trade.premium * trade.contracts * 100).toFixed(2)} (max profit)</span>
            </>
          )}
        </div>

        <button
          onClick={() => onConfirm({
            close_price: closeType === "closed" ? parseFloat(closePrice) || 0 : closeType === "expired" ? 0 : undefined,
            underlying_price_at_close: closeType === "assigned" ? parseFloat(underlyingPrice) || undefined : undefined,
            status: closeType,
            outcome_notes: notes || undefined,
          })}
          disabled={isClosing || (closeType === "closed" && !closePrice)}
          className="w-full px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isClosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
    ? Math.max(0, Math.round((new Date(trade.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isExpiring = isOpen && daysToExpiry <= 7;
  const isExpired = isOpen && daysToExpiry <= 0;

  return (
    <div className={`border rounded-lg p-3 ${
      isOpen ? "border-border/30" : trade.was_profitable ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
            isCSP ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
          }`}>
            {isCSP ? "CSP" : "CC"}
          </span>
          <span className="font-mono text-sm font-bold">{trade.ticker}</span>
          <span className="font-mono text-xs text-muted-foreground">${trade.strike_price.toFixed(2)} {isCSP ? "P" : "C"}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOpen && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${
              isExpired ? "bg-red-500/15 text-red-400 animate-pulse" :
              isExpiring ? "bg-amber-500/15 text-amber-400" :
              "bg-green-500/15 text-green-400"
            }`}>
              {isExpired ? "EXPIRED" : isExpiring ? `${daysToExpiry}d left` : `${daysToExpiry}d`}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase ${
            isOpen ? "bg-blue-500/15 text-blue-400" :
            trade.status === "expired" ? "bg-green-500/15 text-green-400" :
            trade.status === "assigned" ? "bg-amber-500/15 text-amber-400" :
            "bg-muted text-muted-foreground"
          }`}>
            {trade.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[9px] text-muted-foreground">Premium</div>
          <div className="font-mono text-xs text-green-400">${trade.premium.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">{trade.contracts}x Contract{trade.contracts > 1 ? "s" : ""}</div>
          <div className="font-mono text-xs">${(trade.premium * trade.contracts * 100).toFixed(0)}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">Expiry</div>
          <div className="font-mono text-xs">{new Date(trade.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">P&L</div>
          {trade.realized_pnl != null ? (
            <div className={`font-mono text-xs font-bold ${trade.realized_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {trade.realized_pnl >= 0 ? "+" : ""}${trade.realized_pnl.toFixed(0)}
              {trade.return_on_capital != null && (
                <span className="text-[9px] ml-0.5">({(trade.return_on_capital * 100).toFixed(1)}%)</span>
              )}
            </div>
          ) : (
            <div className="font-mono text-xs text-muted-foreground">—</div>
          )}
        </div>
      </div>

      {/* Entry price context */}
      {trade.underlying_price_at_entry != null && (
        <div className="mt-2 text-[9px] text-muted-foreground">
          Entry: <span className="font-mono">${trade.underlying_price_at_entry.toFixed(2)}</span>
          <span className="mx-1">·</span>
          Opened: {new Date(trade.entry_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      )}

      {/* LLM Confidence */}
      {trade.llm_confidence != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="text-[9px] text-muted-foreground">AI Confidence:</div>
          <div className="flex-1 bg-accent/30 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                trade.llm_confidence >= 0.7 ? "bg-green-400" : trade.llm_confidence >= 0.5 ? "bg-yellow-400" : "bg-red-400"
              }`}
              style={{ width: `${trade.llm_confidence * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-mono">{(trade.llm_confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Annualized Return */}
      {trade.annualized_return != null && (
        <div className="mt-1 text-[9px] text-muted-foreground">
          Annualized: <span className={`font-mono ${trade.annualized_return >= 0 ? "text-green-400" : "text-red-400"}`}>
            {(trade.annualized_return * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Outcome Notes */}
      {trade.outcome_notes && (
        <div className="mt-2 text-[9px] text-muted-foreground bg-accent/20 rounded px-2 py-1">
          <span className="font-semibold">Notes:</span> {trade.outcome_notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20">
        {isOpen && (
          <button
            onClick={() => onClose(trade)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-semibold bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Close Trade
          </button>
        )}
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

// ── Main Component ──────────────────────────────────────────

interface TradeJournalProps {
  ticker: string;
}

export function TradeJournal({ ticker }: TradeJournalProps) {
  const [closingTrade, setClosingTrade] = useState<OptionsTrade | null>(null);
  const { data: trades = [], isLoading } = useOptionsTrades(ticker);
  const closeTrade = useCloseOptionsTrade();
  const deleteTrade = useDeleteOptionsTrade();

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status !== "open");

  // Stats
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  const totalPremium = trades.reduce((sum, t) => sum + t.premium * t.contracts * 100, 0);
  const winRate = closedTrades.length > 0
    ? (closedTrades.filter((t) => t.was_profitable).length / closedTrades.length * 100).toFixed(0)
    : null;
  const avgReturn = closedTrades.length > 0
    ? (closedTrades.reduce((sum, t) => sum + (t.return_on_capital || 0), 0) / closedTrades.length * 100).toFixed(1)
    : null;
  const avgAnnualized = closedTrades.length > 0
    ? (closedTrades.reduce((sum, t) => sum + (t.annualized_return || 0), 0) / closedTrades.length * 100).toFixed(1)
    : null;

  async function handleCloseTrade(data: { close_price?: number; underlying_price_at_close?: number; status: "closed" | "expired" | "assigned"; outcome_notes?: string }) {
    if (!closingTrade) return;
    try {
      await closeTrade.mutateAsync({ id: closingTrade.id, ...data });
      setClosingTrade(null);
    } catch (err) {
      console.error("Failed to close trade:", err);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + Stats */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground/80">Trade Journal — {ticker}</h2>
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            {trades.length} total trade{trades.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Stats Grid */}
        {trades.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Open</div>
              <div className="font-mono text-sm font-bold text-blue-400">{openTrades.length}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Closed</div>
              <div className="font-mono text-sm font-bold text-foreground">{closedTrades.length}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Total P&L</div>
              <div className={`font-mono text-sm font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}
              </div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Win Rate</div>
              <div className="font-mono text-sm font-bold">{winRate ? `${winRate}%` : "—"}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Avg Return</div>
              <div className="font-mono text-sm font-bold">{avgReturn ? `${avgReturn}%` : "—"}</div>
            </div>
            <div className="text-center bg-accent/20 rounded-lg p-2.5">
              <div className="text-[9px] text-muted-foreground">Avg Ann.</div>
              <div className="font-mono text-sm font-bold">{avgAnnualized ? `${avgAnnualized}%` : "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card p-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && trades.length === 0 && (
        <div className="card p-10 text-center text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No trades recorded for {ticker}</p>
          <p className="text-xs mt-1.5 max-w-sm mx-auto">
            Go to the <span className="text-primary font-medium">Options</span> tab to view AI-generated
            strategy recommendations and add trades to your journal.
          </p>
        </div>
      )}

      {/* Open Trades */}
      {openTrades.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
              Open Positions ({openTrades.length})
            </span>
            {openTrades.some((t) => {
              const dte = Math.max(0, Math.round((new Date(t.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              return dte <= 7;
            }) && (
              <span className="text-[9px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full animate-pulse">
                <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />
                Expiring soon
              </span>
            )}
          </div>
          {openTrades.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              onClose={setClosingTrade}
              onDelete={(id) => deleteTrade.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Closed Trades */}
      {closedTrades.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
              Closed Trades ({closedTrades.length})
            </span>
          </div>
          {closedTrades.map((trade) => (
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
