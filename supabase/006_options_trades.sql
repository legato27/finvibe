-- ============================================================
-- Options Trades — Cash Secured Put & Income Strategy tracking
-- Stores LLM-recommended trades, P&L on expiry/early close,
-- and inference metadata for future fine-tuning.
-- ============================================================

create table public.options_trades (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,

  -- Strategy
  strategy text not null check (strategy in ('cash_secured_put', 'covered_call', 'put_credit_spread', 'call_credit_spread')),

  -- Contract details
  strike_price float not null,
  premium float not null,            -- premium received per share
  contracts int not null default 1,  -- number of contracts (1 contract = 100 shares)
  expiry_date date not null,
  entry_date date not null default current_date,
  underlying_price_at_entry float,   -- stock price when trade was opened

  -- Status
  status text not null default 'open' check (status in ('open', 'closed', 'expired', 'assigned')),
  close_date date,
  close_price float,                 -- premium paid to close (buy back), null if expired worthless
  underlying_price_at_close float,   -- stock price at close/expiry

  -- P&L (calculated on close/expiry)
  realized_pnl float,               -- net profit/loss in dollars
  return_on_capital float,           -- % return on capital at risk
  annualized_return float,           -- annualized % return

  -- LLM inference metadata (for fine-tuning)
  llm_recommendation jsonb,          -- full LLM output that generated this trade
  llm_confidence float,              -- 0-1 confidence score
  llm_reasoning text,                -- why the LLM recommended this
  llm_model_version text,            -- which model version generated this

  -- Outcome tracking
  outcome_notes text,                -- user notes on what happened
  was_profitable boolean,            -- derived on close

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index ix_options_trades_user on public.options_trades(user_id);
create index ix_options_trades_ticker on public.options_trades(ticker);
create index ix_options_trades_status on public.options_trades(status);
create index ix_options_trades_expiry on public.options_trades(expiry_date);

-- Ensure the updated_at function exists
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Auto-update updated_at
create trigger set_updated_at before update on public.options_trades
  for each row execute function public.update_updated_at();

-- RLS
alter table public.options_trades enable row level security;

create policy "Users can view their own options trades"
  on public.options_trades for select
  using (auth.uid() = user_id);

create policy "Users can insert their own options trades"
  on public.options_trades for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own options trades"
  on public.options_trades for update
  using (auth.uid() = user_id);

create policy "Users can delete their own options trades"
  on public.options_trades for delete
  using (auth.uid() = user_id);
