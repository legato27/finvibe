/**
 * Settling a short option row: the one arithmetic the web journal and the
 * MCP resolve tools share.
 *
 * A short option that EXPIRES worthless keeps the whole credit. One bought
 * back early keeps the difference.
 *
 * An ASSIGNED cash-secured put is valued with its share leg. The journal is
 * the only place the shares live (nothing books them into a portfolio), so
 * recording the credit alone made every assignment read as profit: DOCN on
 * 2026-10-30 booked +$260 while the 100 shares were $20.35 under the strike,
 * a −$1,775 position. The put is marked as if bought back at intrinsic on
 * the assignment close: realised = credit − max(0, strike − spot) × shares,
 * and close_price records that intrinsic. Without the spot there is nothing
 * to mark, so assignment needs underlying_price_at_close.
 *
 * Other assignments keep the credit. A covered call's shares are called away
 * at the strike, so the upside it gave up is not a loss on the row. A put
 * credit spread's loss stops at its long strike, which the journal does not
 * store, so it is not marked here.
 *
 * Pure module: no fetching, no React, so `node --test` runs it directly.
 */

export type SettleStatus = "closed" | "expired" | "assigned";

export type SettleTrade = {
  strategy: string;
  strike_price: number;
  premium: number;
  contracts: number;
  entry_date: string;
};

export type SettleArgs = {
  status: SettleStatus;
  close_date: string;
  /** Premium paid per share to buy back. Closed only. */
  close_price?: number | null;
  underlying_price_at_close?: number | null;
};

export type Settlement = {
  close_price: number | null;
  realized_pnl: number;
  return_on_capital: number | null;
  annualized_return: number | null;
  was_profitable: boolean | null;
};

export function settleOption(t: SettleTrade, a: SettleArgs): Settlement {
  const shares = t.contracts * 100;
  const credit = t.premium * shares;
  const spot = a.underlying_price_at_close ?? null;

  let closePrice = a.close_price ?? null;
  let realized: number;
  let profitable: boolean | null;
  if (a.status === "assigned" && t.strategy === "cash_secured_put") {
    if (spot == null) throw new Error("An assigned put needs underlying_price_at_close to mark the shares");
    closePrice = Math.max(0, t.strike_price - spot);
    realized = credit - closePrice * shares;
    profitable = realized > 0;
  } else if (a.status === "assigned") {
    realized = credit;
    // Judged on the position: spot against the net basis of strike minus premium.
    profitable = spot != null ? spot >= t.strike_price - t.premium : null;
  } else {
    realized = a.status === "closed" ? credit - (closePrice ?? 0) * shares : credit;
    profitable = realized > 0;
  }

  // Capital at risk is the collateral, which is what the return is earned
  // on — not the premium.
  const capital = t.strike_price * shares;
  const days = Math.max(1, Math.round((Date.parse(a.close_date) - Date.parse(t.entry_date)) / 86_400_000));
  const roc = capital > 0 ? realized / capital : null;
  return {
    close_price: closePrice,
    realized_pnl: realized,
    return_on_capital: roc,
    annualized_return: roc != null ? (roc * 365) / days : null,
    was_profitable: profitable,
  };
}
