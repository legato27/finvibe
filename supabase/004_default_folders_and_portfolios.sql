-- ============================================================
-- Migration 004: Default Watchlist Folders + Multi-Portfolio
-- ============================================================

-- ── 1. Portfolios container table ──────────────────────────

create table if not exists public.portfolios (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

create index if not exists ix_portfolios_user_id on public.portfolios(user_id);

-- RLS for portfolios
alter table public.portfolios enable row level security;

create policy "Users manage own portfolios"
  on public.portfolios for all using (auth.uid() = user_id);

-- updated_at trigger
create trigger set_updated_at before update on public.portfolios
  for each row execute function public.update_updated_at();

-- ── 2. Add portfolio_id to portfolio_holdings ──────────────

alter table public.portfolio_holdings
  add column if not exists portfolio_id bigint references public.portfolios(id) on delete cascade;

-- ── 3. Backfill: create default portfolio for existing users ─

-- Create "My Portfolio" for every user who has holdings
insert into public.portfolios (user_id, name, is_default)
select distinct user_id, 'My Portfolio', true
from public.portfolio_holdings
on conflict (user_id, name) do nothing;

-- Also create for users who have profiles but no holdings
insert into public.portfolios (user_id, name, is_default)
select id, 'My Portfolio', true
from public.profiles
where id not in (select user_id from public.portfolios where is_default = true)
on conflict (user_id, name) do nothing;

-- Link existing holdings to their default portfolio
update public.portfolio_holdings ph
set portfolio_id = p.id
from public.portfolios p
where p.user_id = ph.user_id
  and p.is_default = true
  and ph.portfolio_id is null;

-- Make portfolio_id NOT NULL after backfill
alter table public.portfolio_holdings
  alter column portfolio_id set not null;

-- ── 4. Backfill: add "Following" watchlist for existing users ─

insert into public.watchlists (user_id, name, description, is_default)
select id, 'Following', 'Stocks you are tracking', false
from public.profiles
where id not in (
  select user_id from public.watchlists where name = 'Following'
)
on conflict (user_id, name) do nothing;

-- ── 5. Update default creation trigger ─────────────────────

create or replace function public.create_default_watchlist()
returns trigger as $$
begin
  -- Default watchlists
  insert into public.watchlists (user_id, name, description, is_default)
  values
    (new.id, 'My Watchlist', 'Your primary watchlist', true),
    (new.id, 'Following', 'Stocks you are tracking', false);

  -- Default portfolio
  insert into public.portfolios (user_id, name, is_default)
  values (new.id, 'My Portfolio', true);

  return new;
end;
$$ language plpgsql security definer;
