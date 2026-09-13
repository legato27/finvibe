-- ============================================================
-- 024: Index rows on the watchlist.
--
-- An index (^GSPC, ^NDX, ^VIX — yfinance's caret symbols) may sit on a
-- watchlist: it is priced, given price action, and never enriched. It may
-- NOT be a portfolio holding — an index cannot be owned; the ETF that
-- tracks it can, and the stock page points at that ETF.
--
--   * stock_catalog.asset_type accepts 'index'
--   * ensure_stock() accepts a leading caret
--   * add_portfolio_holding() refuses a caret ticker with a plain message
-- ============================================================

alter table public.stock_catalog
  drop constraint if exists stock_catalog_asset_type_check;
alter table public.stock_catalog
  add constraint stock_catalog_asset_type_check
  check (asset_type in ('stock', 'crypto', 'etf', 'index'));

create or replace function public.ensure_stock(p_ticker text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticker text := pg_catalog.upper(pg_catalog.btrim(p_ticker));
  v_stock_id bigint;
begin
  -- A leading caret is a yfinance index symbol.
  if v_ticker !~ '^\^?[A-Z0-9][A-Z0-9.-]{0,14}$' then
    raise exception 'Invalid ticker symbol: %', p_ticker using errcode = '22023';
  end if;

  insert into public.stock_catalog (ticker, enrichment_status, asset_type)
  values (v_ticker, 'pending', case when v_ticker like '^%' then 'index' else 'stock' end)
  on conflict (ticker) do nothing;

  select id into v_stock_id from public.stock_catalog where ticker = v_ticker;
  if v_stock_id is null then
    raise exception 'Could not resolve catalog row for %', v_ticker;
  end if;
  return v_stock_id;
end;
$$;

comment on function public.ensure_stock is
  'Get or create the shared catalog row. DO NOTHING + SELECT so an existing row keeps its updated_at, which the enrichment sweep reads. A caret ticker is an index.';

create or replace function public.add_portfolio_holding(
  p_portfolio_id  bigint,
  p_ticker        text,
  p_shares        numeric,
  p_cost_basis    numeric,
  p_acquired_date date default null,
  p_broker        text default null,
  p_notes         text default null,
  p_currency      text default 'USD',
  p_user_id       uuid default null
) returns public.portfolio_holdings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.acting_user(p_user_id);
  v_row  public.portfolio_holdings;
begin
  if pg_catalog.btrim(p_ticker) like '^%' then
    raise exception 'An index cannot be held; add the ETF that tracks it instead'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.portfolios
     where id = p_portfolio_id and user_id = v_user
  ) then
    raise exception 'Portfolio % not found', p_portfolio_id using errcode = '42501';
  end if;

  perform public.ensure_stock(p_ticker);

  insert into public.portfolio_holdings
    (user_id, portfolio_id, ticker, shares, cost_basis,
     acquired_date, broker, notes, currency)
  values
    (v_user, p_portfolio_id, pg_catalog.upper(pg_catalog.btrim(p_ticker)),
     p_shares, p_cost_basis, p_acquired_date, p_broker, p_notes,
     pg_catalog.upper(coalesce(p_currency, 'USD')))
  returning * into v_row;

  return v_row;
end;
$$;
