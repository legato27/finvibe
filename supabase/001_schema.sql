-- ============================================================
-- VibeFin Supabase Schema
-- Tables: profiles, watchlists, watchlist_items, stock_catalog,
--         portfolio_holdings, stock_notes
-- ============================================================

-- ── 1. User Profiles (extends Supabase auth.users) ──────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Stock Catalog (shared across all users) ─────────────

create table public.stock_catalog (
  id bigint generated always as identity primary key,
  ticker text unique not null,
  name text,
  sector text,
  industry text,
  asset_type text default 'stock' check (asset_type in ('stock', 'crypto', 'etf')),
  -- Enrichment data (written by DGX)
  moat_rating text check (moat_rating in ('Wide', 'Narrow', 'None')),
  moat_confidence float,
  moat_detail jsonb,
  intrinsic_value float,
  margin_of_safety float,
  wacc float,
  -- Price data (written by DGX)
  last_price float,
  last_price_updated_at timestamptz,
  ten_yr_low float,
  ten_yr_high float,
  quarterly_trend text check (quarterly_trend in ('up', 'flat', 'down')),
  yearly_trend text check (yearly_trend in ('up', 'flat', 'down')),
  -- ETF
  is_etf boolean default false,
  etf_memberships jsonb,
  -- Status
  enrichment_status text default 'pending' check (enrichment_status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index ix_stock_catalog_ticker on public.stock_catalog(ticker);
create index ix_stock_catalog_sector on public.stock_catalog(sector);

-- ── 3. Watchlists (user-owned named containers) ────────────

create table public.watchlists (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

create index ix_watchlists_user_id on public.watchlists(user_id);

-- ── 4. Watchlist Items (links watchlists ↔ stocks) ─────────

create table public.watchlist_items (
  id bigint generated always as identity primary key,
  watchlist_id bigint not null references public.watchlists(id) on delete cascade,
  stock_id bigint not null references public.stock_catalog(id),
  notes text,
  added_at timestamptz default now(),
  unique(watchlist_id, stock_id)
);

create index ix_watchlist_items_watchlist on public.watchlist_items(watchlist_id);
create index ix_watchlist_items_stock on public.watchlist_items(stock_id);

-- ── 5. Portfolio Holdings ───────────────────────────────────

create table public.portfolio_holdings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  shares float not null,
  cost_basis float not null,          -- per share
  acquired_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index ix_portfolio_user on public.portfolio_holdings(user_id);
create index ix_portfolio_user_ticker on public.portfolio_holdings(user_id, ticker);

-- ── 6. Stock Notes ──────────────────────────────────────────

create table public.stock_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  title text,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index ix_notes_user_ticker on public.stock_notes(user_id, ticker);

-- ── 7. Auto-create default watchlist on profile creation ────

create or replace function public.create_default_watchlist()
returns trigger as $$
begin
  insert into public.watchlists (user_id, name, is_default)
  values (new.id, 'My Watchlist', true);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.create_default_watchlist();

-- ── 8. Updated_at auto-trigger ──────────────────────────────

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.stock_catalog
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.watchlists
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.portfolio_holdings
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.stock_notes
  for each row execute function public.update_updated_at();
