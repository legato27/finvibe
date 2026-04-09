-- ============================================================
-- 005: Broker Connections (IBKR, Moomoo)
-- ============================================================

-- Stores broker connection config per user per portfolio
create table if not exists public.broker_connections (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  portfolio_id bigint not null references public.portfolios(id) on delete cascade,
  broker      text not null check (broker in ('ibkr', 'moomoo')),
  -- Connection config (host/port for the gateway)
  host        text not null default '127.0.0.1',
  port        int not null,
  account_id  text,                       -- IBKR account ID or Moomoo account
  trd_env     text default 'REAL',        -- Moomoo: REAL or SIMULATE
  enabled     boolean default true,
  last_sync_at timestamptz,
  last_sync_status text,                  -- 'success', 'error', 'syncing'
  last_sync_error  text,
  sync_count  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, portfolio_id, broker)
);

-- Index
create index if not exists idx_broker_connections_user on public.broker_connections(user_id);

-- RLS
alter table public.broker_connections enable row level security;

create policy "Users manage own broker connections"
  on public.broker_connections for all
  using (auth.uid() = user_id);

-- Updated_at trigger
create trigger set_updated_at before update on public.broker_connections
  for each row execute function public.update_updated_at();

-- Add source column to portfolio_holdings to track origin
alter table public.portfolio_holdings
  add column if not exists source text default 'manual';
-- source: 'manual', 'ibkr', 'moomoo'

-- Add broker_connection_id for holdings synced from brokers
alter table public.portfolio_holdings
  add column if not exists broker_connection_id bigint references public.broker_connections(id) on delete set null;
