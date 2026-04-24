-- ============================================================
-- Migration 008: Portfolio AI Risk Analyses
-- Stores Bridgewater-style risk memos produced by Claude or
-- local Gemma (vLLM) with a point-in-time holdings snapshot.
-- ============================================================

create table if not exists public.portfolio_analyses (
  id bigint generated always as identity primary key,
  portfolio_id bigint not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('claude', 'gemma')),
  model text,
  -- Point-in-time holdings snapshot (array of {ticker, shares, cost_basis,
  -- current_price, mkt_value, weight_pct, name?, sector?})
  holdings_snapshot jsonb not null,
  total_value numeric,
  total_cost numeric,
  -- Recommendation — markdown memo from the LLM
  analysis text not null,
  -- Optional structured summary (risk tier, verdict, tables)
  summary jsonb,
  prompt text,
  error text,
  status text not null default 'complete' check (status in ('complete', 'failed')),
  created_at timestamptz default now()
);

create index if not exists ix_portfolio_analyses_portfolio on public.portfolio_analyses(portfolio_id, created_at desc);
create index if not exists ix_portfolio_analyses_user on public.portfolio_analyses(user_id, created_at desc);

alter table public.portfolio_analyses enable row level security;

create policy "Users manage own portfolio analyses"
  on public.portfolio_analyses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
