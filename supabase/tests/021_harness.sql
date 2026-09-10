create schema if not exists auth;
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;

create table public.profiles (id uuid primary key);
create table public.stock_catalog (
  id bigint generated always as identity primary key,
  ticker text unique not null,
  name text,
  enrichment_status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table public.watchlists (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text
);
create table public.watchlist_items (
  id bigint generated always as identity primary key,
  watchlist_id bigint not null references public.watchlists(id) on delete cascade,
  stock_id bigint not null references public.stock_catalog(id),
  unique(watchlist_id, stock_id)
);
create table public.portfolios (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text
);
create table public.portfolio_holdings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id bigint not null references public.portfolios(id) on delete cascade,
  ticker text not null,
  shares float not null,
  cost_basis float not null,
  acquired_date date,
  broker text,
  notes text,
  currency text default 'USD',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function public.update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger set_updated_at before update on public.stock_catalog
  for each row execute function public.update_updated_at();

insert into public.profiles values ('11111111-1111-1111-1111-111111111111'),
                                   ('22222222-2222-2222-2222-222222222222');
insert into public.watchlists (user_id, name) values ('11111111-1111-1111-1111-111111111111','Mine');
insert into public.watchlists (user_id, name) values ('22222222-2222-2222-2222-222222222222','Theirs');
insert into public.portfolios (user_id, name) values ('11111111-1111-1111-1111-111111111111','Mine');
