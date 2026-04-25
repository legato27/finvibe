-- ============================================================
-- Stock Sales — record sell transactions against portfolio lots.
--   Companion to portfolio_holdings (which tracks open buy lots).
--   When a user sells, the lot's `shares` is reduced (or deleted
--   if fully sold) AND a row is written here for realized-P&L
--   history.
-- ============================================================

create table if not exists public.stock_sales (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id bigint not null references public.portfolios(id) on delete cascade,
  -- Source lot. Nullable so lot deletes don't drop sale history.
  holding_id bigint references public.portfolio_holdings(id) on delete set null,
  ticker text not null,
  shares_sold float not null check (shares_sold > 0),
  sale_price float not null check (sale_price >= 0),     -- per share
  cost_basis float not null check (cost_basis >= 0),     -- snapshot from lot at sell time
  realized_pnl float not null,                           -- (sale_price - cost_basis) * shares_sold
  currency text not null default 'USD',
  sale_date date,
  broker text,
  notes text,
  created_at timestamptz default now()
);

alter table public.stock_sales
  drop constraint if exists stock_sales_currency_fmt;
alter table public.stock_sales
  add constraint stock_sales_currency_fmt
  check (currency ~ '^[A-Z]{3}$');

create index if not exists ix_stock_sales_user on public.stock_sales(user_id);
create index if not exists ix_stock_sales_portfolio on public.stock_sales(portfolio_id);
create index if not exists ix_stock_sales_portfolio_ticker on public.stock_sales(portfolio_id, ticker);

-- RLS
alter table public.stock_sales enable row level security;

create policy "Users manage own stock sales"
  on public.stock_sales for all using (auth.uid() = user_id);
