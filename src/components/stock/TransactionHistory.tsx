"use client";
import { useState } from "react";
import {
  Pencil, Trash2, Check, X, Plus, Building2, StickyNote,
  CalendarDays, AlertTriangle, DollarSign, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  useUpdateHolding, useDeleteHolding, useAddHolding, useSellLot, useStockSales,
  HoldingWithPrice, StockSale,
} from "@/lib/supabase/hooks";

// ── Common brokers datalist ───────────────────────────────────
const BROKERS = [
  "Tiger Brokers", "Moomoo", "Interactive Brokers", "Saxo Bank",
  "DBS Vickers", "OCBC Securities", "UOB Kay Hian", "Webull",
  "Robinhood", "Fidelity", "Charles Schwab", "TD Ameritrade",
];

// ── Shared input style ────────────────────────────────────────
const inputCls =
  "px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full";

// ── Edit form for an existing lot ─────────────────────────────
interface EditRowProps {
  lot: HoldingWithPrice;
  onDone: () => void;
}

function EditRow({ lot, onDone }: EditRowProps) {
  const update = useUpdateHolding();
  const [fields, setFields] = useState({
    shares: String(lot.shares),
    cost_basis: String(lot.cost_basis),
    acquired_date: lot.acquired_date || "",
    broker: lot.broker || "",
    notes: lot.notes || "",
  });

  function save() {
    update.mutate({
      id: lot.id,
      shares: parseFloat(fields.shares),
      cost_basis: parseFloat(fields.cost_basis),
      acquired_date: fields.acquired_date || null,
      broker: fields.broker || null,
      notes: fields.notes || null,
    }, { onSuccess: onDone });
  }

  return (
    <tr className="bg-primary/5 border-b border-border/40">
      <td className="px-3 py-2">
        <input
          type="date"
          value={fields.acquired_date}
          onChange={(e) => setFields({ ...fields, acquired_date: e.target.value })}
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="any"
          value={fields.shares}
          onChange={(e) => setFields({ ...fields, shares: e.target.value })}
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <input
            type="number"
            step="any"
            value={fields.cost_basis}
            onChange={(e) => setFields({ ...fields, cost_basis: e.target.value })}
            className={`${inputCls} pl-6`}
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm text-muted-foreground">
        ${(parseFloat(fields.shares || "0") * parseFloat(fields.cost_basis || "0")).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
      <td className="px-3 py-2">
        <input
          list="broker-list-edit"
          value={fields.broker}
          onChange={(e) => setFields({ ...fields, broker: e.target.value })}
          placeholder="Broker"
          className={inputCls}
        />
        <datalist id="broker-list-edit">
          {BROKERS.map((b) => <option key={b} value={b} />)}
        </datalist>
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        <input
          value={fields.notes}
          onChange={(e) => setFields({ ...fields, notes: e.target.value })}
          placeholder="Notes"
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={save}
            disabled={update.isPending}
            className="p-1.5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDone}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add lot form ──────────────────────────────────────────────
interface AddLotRowProps {
  ticker: string;
  portfolioId: number;
  onDone: () => void;
}

function AddLotRow({ ticker, portfolioId, onDone }: AddLotRowProps) {
  const add = useAddHolding();
  const [fields, setFields] = useState({
    shares: "",
    cost_basis: "",
    acquired_date: "",
    broker: "",
    notes: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.shares || !fields.cost_basis) return;
    add.mutate({
      ticker,
      shares: parseFloat(fields.shares),
      cost_basis: parseFloat(fields.cost_basis),
      portfolio_id: portfolioId,
      acquired_date: fields.acquired_date || undefined,
      broker: fields.broker || undefined,
      notes: fields.notes || undefined,
    }, { onSuccess: onDone });
  }

  return (
    <tr className="bg-green-500/5 border-b border-border/40">
      <td className="px-3 py-2">
        <input
          type="date"
          value={fields.acquired_date}
          onChange={(e) => setFields({ ...fields, acquired_date: e.target.value })}
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="any"
          value={fields.shares}
          onChange={(e) => setFields({ ...fields, shares: e.target.value })}
          placeholder="Shares"
          className={inputCls}
          required
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <input
            type="number"
            step="any"
            value={fields.cost_basis}
            onChange={(e) => setFields({ ...fields, cost_basis: e.target.value })}
            placeholder="Cost/sh"
            className={`${inputCls} pl-6`}
            required
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm text-muted-foreground">
        {fields.shares && fields.cost_basis
          ? `$${(parseFloat(fields.shares) * parseFloat(fields.cost_basis)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : "—"}
      </td>
      <td className="px-3 py-2">
        <input
          list="broker-list-add"
          value={fields.broker}
          onChange={(e) => setFields({ ...fields, broker: e.target.value })}
          placeholder="Broker"
          className={inputCls}
        />
        <datalist id="broker-list-add">
          {BROKERS.map((b) => <option key={b} value={b} />)}
        </datalist>
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        <input
          value={fields.notes}
          onChange={(e) => setFields({ ...fields, notes: e.target.value })}
          placeholder="Notes"
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={submit}
            disabled={add.isPending || !fields.shares || !fields.cost_basis}
            className="p-1.5 rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDone}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Sell form for an existing lot ─────────────────────────────
interface SellRowProps {
  lot: HoldingWithPrice;
  onDone: () => void;
}

function SellRow({ lot, onDone }: SellRowProps) {
  const sell = useSellLot();
  const [fields, setFields] = useState({
    shares_sold: String(lot.shares),
    sale_price: lot.current_price ? String(lot.current_price) : "",
    sale_date: new Date().toISOString().slice(0, 10),
    broker: lot.broker || "",
    notes: "",
  });

  const sharesNum = parseFloat(fields.shares_sold || "0");
  const priceNum = parseFloat(fields.sale_price || "0");
  const proceeds = sharesNum * priceNum;
  const realized = sharesNum > 0 && priceNum > 0
    ? (priceNum - lot.cost_basis) * sharesNum
    : 0;
  const valid = sharesNum > 0 && sharesNum <= lot.shares + 1e-9 && priceNum >= 0 && fields.sale_price !== "";

  function submit() {
    if (!valid) return;
    sell.mutate({
      lot,
      shares_sold: sharesNum,
      sale_price: priceNum,
      sale_date: fields.sale_date || undefined,
      broker: fields.broker || undefined,
      notes: fields.notes || undefined,
    }, { onSuccess: onDone });
  }

  return (
    <tr className="bg-amber-500/5 border-b border-border/40">
      <td className="px-3 py-2">
        <input
          type="date"
          value={fields.sale_date}
          onChange={(e) => setFields({ ...fields, sale_date: e.target.value })}
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="any"
          max={lot.shares}
          value={fields.shares_sold}
          onChange={(e) => setFields({ ...fields, shares_sold: e.target.value })}
          placeholder={`Max ${lot.shares}`}
          className={inputCls}
        />
        <div className="text-[9px] text-muted-foreground mt-0.5">
          Lot: {lot.shares % 1 === 0 ? lot.shares : lot.shares.toFixed(4)}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <input
            type="number"
            step="any"
            value={fields.sale_price}
            onChange={(e) => setFields({ ...fields, sale_price: e.target.value })}
            placeholder="Sale price"
            className={`${inputCls} pl-6`}
          />
        </div>
        <div className="text-[9px] text-muted-foreground mt-0.5">
          Cost: ${lot.cost_basis.toFixed(2)}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-sm">
        <div className="text-muted-foreground">
          ${proceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        {sharesNum > 0 && priceNum > 0 && (
          <div className={`text-[10px] font-semibold ${realized >= 0 ? "text-green-500" : "text-red-500"}`}>
            P&L {realized >= 0 ? "+" : "−"}${Math.abs(realized).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          list="broker-list-sell"
          value={fields.broker}
          onChange={(e) => setFields({ ...fields, broker: e.target.value })}
          placeholder="Broker"
          className={inputCls}
        />
        <datalist id="broker-list-sell">
          {BROKERS.map((b) => <option key={b} value={b} />)}
        </datalist>
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        <input
          value={fields.notes}
          onChange={(e) => setFields({ ...fields, notes: e.target.value })}
          placeholder="Sale notes"
          className={inputCls}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={submit}
            disabled={sell.isPending || !valid}
            className="p-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors disabled:opacity-40"
            title="Confirm sell"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDone}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Confirm delete ────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onConfirm} className="text-xs px-3 py-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 min-h-[36px]">Yes</button>
      <button onClick={onCancel} className="text-xs px-3 py-1.5 bg-accent rounded text-muted-foreground hover:bg-accent/70 min-h-[36px]">No</button>
    </div>
  );
}

// ── Sold history (realized P&L) ───────────────────────────────
function SoldHistory({ sales }: { sales: StockSale[] }) {
  const totalRealized = sales.reduce((s, x) => s + x.realized_pnl, 0);
  const totalShares = sales.reduce((s, x) => s + x.shares_sold, 0);
  const totalProceeds = sales.reduce((s, x) => s + x.shares_sold * x.sale_price, 0);

  return (
    <div className="border-t border-border/40">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Sold ({sales.length})
          </span>
        </div>
        <div className={`text-xs font-mono font-semibold flex items-center gap-1 ${
          totalRealized >= 0 ? "text-green-500" : "text-red-500"
        }`}>
          {totalRealized >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          Realized {totalRealized >= 0 ? "+" : "−"}${Math.abs(totalRealized).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-medium">
                <CalendarDays className="w-3 h-3 inline mr-1" />Sold
              </th>
              <th className="px-3 py-2 text-left font-medium">Shares</th>
              <th className="px-3 py-2 text-left font-medium">Sale/sh</th>
              <th className="px-3 py-2 text-right font-medium">Proceeds</th>
              <th className="px-3 py-2 text-right font-medium">Realized P&L</th>
              <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">
                <Building2 className="w-3 h-3 inline mr-1" />Broker
              </th>
              <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">
                <StickyNote className="w-3 h-3 inline mr-1" />Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => {
              const proceeds = s.shares_sold * s.sale_price;
              const isGain = s.realized_pnl >= 0;
              return (
                <tr key={s.id} className="border-b border-border/20 hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {s.sale_date || <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    {s.shares_sold % 1 === 0 ? s.shares_sold : s.shares_sold.toFixed(4)}
                  </td>
                  <td className="px-3 py-2.5 font-mono">${s.sale_price.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-right text-muted-foreground">
                    ${proceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-right font-semibold ${
                    isGain ? "text-green-500" : "text-red-500"
                  }`}>
                    {isGain ? "+" : "−"}${Math.abs(s.realized_pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <div className="text-[9px] font-normal text-muted-foreground/70">
                      cost ${s.cost_basis.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {s.broker
                      ? <span className="text-xs px-2 py-0.5 bg-accent/60 rounded text-muted-foreground">{s.broker}</span>
                      : <span className="opacity-30 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate hidden sm:table-cell">
                    {s.notes || <span className="opacity-30">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {sales.length > 1 && (
            <tfoot>
              <tr className="border-t border-border/40 bg-muted/20">
                <td className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Total
                </td>
                <td className="px-3 py-2 font-mono font-semibold text-sm">
                  {totalShares % 1 === 0 ? totalShares : totalShares.toFixed(4)}
                </td>
                <td />
                <td className="px-3 py-2 font-mono font-semibold text-sm text-right">
                  ${totalProceeds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className={`px-3 py-2 font-mono font-semibold text-sm text-right ${
                  totalRealized >= 0 ? "text-green-500" : "text-red-500"
                }`}>
                  {totalRealized >= 0 ? "+" : "−"}${Math.abs(totalRealized).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td colSpan={2} className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

interface TransactionHistoryProps {
  ticker: string;
  portfolioId: number;
  lots: HoldingWithPrice[];
}

export function TransactionHistory({ ticker, portfolioId, lots }: TransactionHistoryProps) {
  const deleteMutation = useDeleteHolding();
  const { data: sales = [] } = useStockSales(portfolioId, ticker);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sellingId, setSellingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const sorted = [...lots].sort((a, b) => {
    // Most recent first; null dates go to bottom
    if (!a.acquired_date && !b.acquired_date) return b.id - a.id;
    if (!a.acquired_date) return 1;
    if (!b.acquired_date) return -1;
    return b.acquired_date.localeCompare(a.acquired_date);
  });

  // Summary row
  const totalShares = lots.reduce((s, l) => s + l.shares, 0);
  const avgCost = lots.reduce((s, l) => s + l.shares * l.cost_basis, 0) / (totalShares || 1);
  const totalCost = lots.reduce((s, l) => s + l.shares * l.cost_basis, 0);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">Transaction History — {ticker}</span>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Lot
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-medium">
                <CalendarDays className="w-3 h-3 inline mr-1" />Date
              </th>
              <th className="px-3 py-2 text-left font-medium">Shares</th>
              <th className="px-3 py-2 text-left font-medium">Cost/sh</th>
              <th className="px-3 py-2 text-right font-medium">Total Cost</th>
              <th className="px-3 py-2 text-left font-medium">
                <Building2 className="w-3 h-3 inline mr-1" />Broker
              </th>
              <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">
                <StickyNote className="w-3 h-3 inline mr-1" />Notes
              </th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {showAdd && (
              <AddLotRow
                ticker={ticker}
                portfolioId={portfolioId}
                onDone={() => setShowAdd(false)}
              />
            )}
            {sorted.map((lot) =>
              editingId === lot.id ? (
                <EditRow key={lot.id} lot={lot} onDone={() => setEditingId(null)} />
              ) : sellingId === lot.id ? (
                <SellRow key={lot.id} lot={lot} onDone={() => setSellingId(null)} />
              ) : (
                <tr
                  key={lot.id}
                  className="border-b border-border/20 hover:bg-accent/30 transition-colors group"
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {lot.acquired_date || <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono">
                    {lot.shares % 1 === 0 ? lot.shares : lot.shares.toFixed(4)}
                  </td>
                  <td className="px-3 py-2.5 font-mono">${lot.cost_basis.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-right text-muted-foreground">
                    ${(lot.shares * lot.cost_basis).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2.5">
                    {lot.broker
                      ? <span className="text-xs px-2 py-0.5 bg-accent/60 rounded text-muted-foreground">{lot.broker}</span>
                      : <span className="opacity-30 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate hidden sm:table-cell">
                    {lot.notes || <span className="opacity-30">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {deletingId === lot.id ? (
                      <DeleteConfirm
                        onConfirm={() => {
                          deleteMutation.mutate(lot.id);
                          setDeletingId(null);
                        }}
                        onCancel={() => setDeletingId(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setSellingId(lot.id); setEditingId(null); setDeletingId(null); }}
                          className="p-2 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Record sell"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingId(lot.id); setDeletingId(null); setSellingId(null); }}
                          className="p-2 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setDeletingId(lot.id); setEditingId(null); setSellingId(null); }}
                          className="p-2 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
          {lots.length > 1 && (
            <tfoot>
              <tr className="border-t border-border/40 bg-muted/20">
                <td className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  {lots.length} lots
                </td>
                <td className="px-3 py-2 font-mono font-semibold text-sm">
                  {totalShares % 1 === 0 ? totalShares : totalShares.toFixed(4)}
                </td>
                <td className="px-3 py-2 font-mono text-sm text-muted-foreground">
                  ${avgCost.toFixed(2)} avg
                </td>
                <td className="px-3 py-2 font-mono font-semibold text-sm text-right">
                  ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {sales.length > 0 && (
        <SoldHistory sales={sales} />
      )}
    </div>
  );
}
