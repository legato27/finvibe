-- 027: assigned cash-secured puts carry their share leg.
--
-- Until now an assigned put booked its whole credit as realised P&L and left
-- the shares to a portfolio that nothing ever wrote to, so every assignment
-- read as profit: DOCN (2026-10-30) +$260 while the 100 shares closed $20.35
-- under the strike, a −$1,775 position. From this release `settleOption`
-- (src/lib/optionSettle.ts) marks the put at intrinsic on the assignment
-- close. This backfill applies the same arithmetic to rows settled before
-- it. Idempotent: it recomputes from strike, premium and the stored close.
--
-- Rows assigned without underlying_price_at_close cannot be marked and are
-- left alone; the select at the bottom lists them.

update public.options_trades t
set
  close_price = m.intrinsic,
  realized_pnl = m.realized,
  return_on_capital = m.realized / (t.strike_price * t.contracts * 100),
  annualized_return = m.realized / (t.strike_price * t.contracts * 100) * 365
                      / greatest(1, t.close_date - t.entry_date),
  was_profitable = m.realized > 0
from (
  select id,
         greatest(0, strike_price - underlying_price_at_close) as intrinsic,
         (premium - greatest(0, strike_price - underlying_price_at_close)) * contracts * 100 as realized
  from public.options_trades
  where asset_class = 'options'
    and strategy = 'cash_secured_put'
    and status = 'assigned'
    and underlying_price_at_close is not null
) m
where t.id = m.id;

select id, ticker, strike_price, close_date
from public.options_trades
where asset_class = 'options' and strategy = 'cash_secured_put' and status = 'assigned'
  and underlying_price_at_close is null;
