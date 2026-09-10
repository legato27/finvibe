-- ── Adding a stock, in one transaction ─────────────────────────────────
--
-- Every add is two writes: the shared public.stock_catalog row, then the row
-- that links it to a user — public.watchlist_items, or public.portfolio_holdings
-- keyed by ticker text. Split across two round trips from the client, the
-- second can fail while the first has already committed, and the catalog row
-- survives referenced by nobody.
--
-- Nothing could then reach it. The application's sweeps find rows THROUGH a
-- user's watchlists and holdings, so a row with no user has no sweep that can
-- see it. MVRL sat 'pending' for eight days with created_at still equal to
-- updated_at.
--
-- Application code already carries two answers to this: each add path discards
-- the row it created when its own link insert fails, and an hourly reap
-- collects whatever slipped through. Both are compensating actions — they run
-- after the fact and only if the process survives long enough to run them. A
-- function body is one transaction, so failure unwinds the catalog insert with
-- no compensation to attempt and nothing to leak if the client disappears
-- mid-call. The two application paths stay as the backstop for rows created
-- before this migration, and for any caller still on the old two-step.
--
-- Both functions are SECURITY DEFINER, which means they bypass RLS and the
-- ownership checks below are the only thing between a caller and someone
-- else's watchlist or portfolio. They are written to be read that way.

-- The acting user. auth.uid() for a browser; NULL for service_role, which is
-- how the MCP server and the /api/enrich route call in, so those pass the user
-- they act for explicitly. auth.uid() WINS when present, so an authenticated
-- caller cannot act as anyone else by passing p_user_id. anon holds no execute
-- grant on either function, so "no auth.uid() and no p_user_id" is the only
-- remaining case and it is rejected.
create or replace function public.acting_user(p_user_id uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_user is null then
    raise exception 'No acting user' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

comment on function public.acting_user is
  'Resolve who an add is for. auth.uid() when a browser calls; p_user_id only when it is absent, i.e. service_role.';

-- ── Ensure the shared catalog row ──────────────────────────────────────
--
-- ON CONFLICT DO NOTHING and then SELECT, rather than DO UPDATE ... RETURNING.
-- public.stock_catalog carries a `set_updated_at BEFORE UPDATE` trigger from
-- 001, so the usual upsert-returning-id trick would bump updated_at on a row
-- this call did not change — and updated_at is exactly what the application's
-- sweep reads to decide a 'processing' row has been abandoned. A no-op write
-- here would keep resetting that clock.
--
-- Under READ COMMITTED the INSERT blocks on the unique index if a concurrent
-- transaction is inserting the same ticker, and the SELECT that follows takes
-- a fresh snapshot, so it sees whichever row won.
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
  -- Same shape TICKER_RE enforces in src/lib/mcp/db.ts and the blank-row
  -- insert policy in 018. Covers US tickers, SGX (O39.SI), crypto (BTC-USD)
  -- and class shares (BRK.B); rejects LLM special-token leakage.
  if v_ticker !~ '^[A-Z0-9][A-Z0-9.-]{0,14}$' then
    raise exception 'Invalid ticker symbol: %', p_ticker using errcode = '22023';
  end if;

  insert into public.stock_catalog (ticker, enrichment_status)
  values (v_ticker, 'pending')
  on conflict (ticker) do nothing;

  select id into v_stock_id from public.stock_catalog where ticker = v_ticker;
  if v_stock_id is null then
    raise exception 'Could not resolve catalog row for %', v_ticker;
  end if;
  return v_stock_id;
end;
$$;

comment on function public.ensure_stock is
  'Get or create the shared catalog row. DO NOTHING + SELECT so an existing row keeps its updated_at, which the enrichment sweep reads.';

-- ── Watchlist add ──────────────────────────────────────────────────────
create or replace function public.add_watchlist_stock(
  p_watchlist_id bigint,
  p_ticker       text,
  p_user_id      uuid default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := public.acting_user(p_user_id);
  v_stock_id bigint;
begin
  -- SECURITY DEFINER bypasses RLS. This is the whole access check.
  if not exists (
    select 1 from public.watchlists
     where id = p_watchlist_id and user_id = v_user
  ) then
    raise exception 'Watchlist % not found', p_watchlist_id using errcode = '42501';
  end if;

  v_stock_id := public.ensure_stock(p_ticker);

  -- Deliberately no ON CONFLICT. Adding a duplicate still raises, which is the
  -- behaviour callers already handle — and the raise is what unwinds the
  -- catalog insert above, which is the point of the whole function.
  insert into public.watchlist_items (watchlist_id, stock_id)
  values (p_watchlist_id, v_stock_id);

  return v_stock_id;
end;
$$;

comment on function public.add_watchlist_stock is
  'Create the catalog row and the watchlist link in one transaction, so a failed link cannot leave an unreferenced catalog row behind.';

-- ── Portfolio add ──────────────────────────────────────────────────────
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
  if not exists (
    select 1 from public.portfolios
     where id = p_portfolio_id and user_id = v_user
  ) then
    raise exception 'Portfolio % not found', p_portfolio_id using errcode = '42501';
  end if;

  -- The catalog row is ensured even though portfolio_holdings.ticker carries
  -- no foreign key to it. Nothing in the database would object to a holding on
  -- a ticker absent from the catalog, and the UI joins the two by ticker to
  -- find a name and a price.
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

comment on function public.add_portfolio_holding is
  'Create the catalog row and the holding in one transaction. Returns the holding so callers need no follow-up select.';

-- ── Grants ─────────────────────────────────────────────────────────────
--
-- anon gets nothing: acting_user would reject it anyway, but an unauthenticated
-- caller should not reach a SECURITY DEFINER function at all. ensure_stock is
-- not granted separately — it exists to be called by the two above, inside
-- their ownership checks, and on its own it would be a way to plant catalog
-- rows without linking them, which is the very thing being fixed.
revoke all on function public.acting_user(uuid) from public, anon;
revoke all on function public.ensure_stock(text) from public, anon, authenticated;
revoke all on function public.add_watchlist_stock(bigint, text, uuid) from public, anon;
revoke all on function public.add_portfolio_holding(
  bigint, text, numeric, numeric, date, text, text, text, uuid) from public, anon;

grant execute on function public.add_watchlist_stock(bigint, text, uuid)
  to authenticated, service_role;
grant execute on function public.add_portfolio_holding(
  bigint, text, numeric, numeric, date, text, text, text, uuid)
  to authenticated, service_role;
