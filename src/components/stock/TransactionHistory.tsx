"use client";
import { useState } from "react";
import {
  Pencil, Trash2, Check, X, Plus, Building2, StickyNote,
  CalendarDays, AlertTriangle,
} from "lucide-react";
import { useUpdateHolding, useDeleteHolding, useAddHolding, HoldingWithPrice } from "@/lib/supabase/hooks";

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
      <td className="px-3 py-2">
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
      <td className="px-3 py-2">
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

// ── Confirm delete ────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-400 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> Delete?
      </span>
      <button onClick={onConfirm} className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">Yes</button>
      <button onClick={onCancel} className="text-xs px-2 py-0.5 bg-accent rounded text-muted-foreground hover:bg-accent/70">No</button>
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
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
              <th className="px-3 py-2 text-left font-medium">
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
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
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
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(lot.id); setDeletingId(null); }}
                          className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setDeletingId(lot.id); setEditingId(null); }}
                          className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
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
    </div>
  );
}
