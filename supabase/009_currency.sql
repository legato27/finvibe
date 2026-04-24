-- ============================================================
-- Currency support
--   - profiles.default_currency : user's preferred display currency
--   - portfolio_holdings.currency : currency the holding is priced in
-- Both default to USD so existing rows keep working unchanged.
-- ============================================================

alter table public.profiles
  add column if not exists default_currency text not null default 'USD';

alter table public.portfolio_holdings
  add column if not exists currency text not null default 'USD';

-- Basic sanity constraint (ISO-4217 is always 3 uppercase letters).
-- Using CHECK rather than an enum so new currencies don't require a migration.
alter table public.profiles
  drop constraint if exists profiles_default_currency_fmt;
alter table public.profiles
  add constraint profiles_default_currency_fmt
  check (default_currency ~ '^[A-Z]{3}$');

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_currency_fmt;
alter table public.portfolio_holdings
  add constraint portfolio_holdings_currency_fmt
  check (currency ~ '^[A-Z]{3}$');

create index if not exists ix_portfolio_holdings_currency
  on public.portfolio_holdings(user_id, currency);
