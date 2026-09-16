-- 025: generalise the trade journal for a second strategy family.
--
-- options_trades keeps every existing column and default; the options desk's
-- rows, hooks and tools are unchanged (asset_class 'options', mode 'live').
-- A crypto scalp trade is a row with asset_class 'crypto', strategy
-- scalp_A / scalp_B / scalp_C, mode 'paper' until live crypto exists, and the
-- crypto-only columns filled; its option-only columns stay null, which is why
-- expiry_date / strike_price / premium lose their NOT NULL.
--
-- mode is a hard column, never inferred: every stats reader filters on it.

alter table public.options_trades
  add column if not exists asset_class text not null default 'options'
    check (asset_class in ('options', 'crypto')),
  add column if not exists mode text not null default 'live'
    check (mode in ('live', 'paper', 'backtest')),
  add column if not exists venue text,
  add column if not exists side text check (side is null or side in ('long', 'short')),
  add column if not exists entry_ts timestamptz,
  add column if not exists exit_ts timestamptz,
  add column if not exists entry_px float,
  add column if not exists exit_px float,
  add column if not exists size float,
  add column if not exists fees float,
  add column if not exists funding float,
  add column if not exists slippage_modelled float,
  add column if not exists slippage_realised float,
  add column if not exists stop_px float,
  add column if not exists target_px float,
  add column if not exists r_planned float,
  add column if not exists r_realised float,
  add column if not exists mae float,
  add column if not exists mfe float,
  add column if not exists exit_reason text,
  add column if not exists regime_at_entry jsonb,
  add column if not exists packet_id text,
  add column if not exists engine_signal_id text,
  add column if not exists session text;

-- the option-only columns become nullable; options rows still carry them
alter table public.options_trades
  alter column expiry_date drop not null,
  alter column strike_price drop not null,
  alter column premium drop not null;

-- the strategy list gains the three scalp setups
alter table public.options_trades drop constraint if exists options_trades_strategy_check;
alter table public.options_trades add constraint options_trades_strategy_check
  check (strategy in ('cash_secured_put', 'covered_call', 'put_credit_spread', 'call_credit_spread',
                      'scalp_A', 'scalp_B', 'scalp_C'));

-- an options row must still carry its contract; a crypto row its fill
alter table public.options_trades drop constraint if exists options_trades_family_shape;
alter table public.options_trades add constraint options_trades_family_shape check (
  (asset_class = 'options' and expiry_date is not null and strike_price is not null and premium is not null)
  or
  (asset_class = 'crypto' and side is not null and entry_px is not null and size is not null)
);

create index if not exists ix_options_trades_class_mode on public.options_trades (user_id, asset_class, mode, status);
create index if not exists ix_options_trades_signal on public.options_trades (engine_signal_id) where engine_signal_id is not null;
