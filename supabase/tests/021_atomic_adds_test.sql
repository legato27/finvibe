\set ME  '11111111-1111-1111-1111-111111111111'
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- 1. Happy path: browser identity, own watchlist.
select set_config('test.uid', :'ME', false);
select 'T1 add own watchlist -> ' ||
  case when public.add_watchlist_stock(1, 'aapl') > 0 then 'PASS' else 'FAIL' end;
select 'T1 catalog row created (uppercased) -> ' ||
  case when (select count(*) from public.stock_catalog where ticker='AAPL')=1 then 'PASS' else 'FAIL' end;
select 'T1 link row created -> ' ||
  case when (select count(*) from public.watchlist_items)=1 then 'PASS' else 'FAIL' end;

-- 2. THE POINT: a link that fails must leave no catalog row behind.
do $$
begin
  perform public.add_watchlist_stock(2, 'ZNEW');   -- watchlist 2 belongs to the other user
  raise exception 'T2 FAIL: expected a permission error';
exception when sqlstate '42501' then
  null;
end $$;
select 'T2 foreign watchlist rejected -> PASS';
select 'T2 no orphan catalog row for ZNEW -> ' ||
  case when (select count(*) from public.stock_catalog where ticker='ZNEW')=0
       then 'PASS' else 'FAIL — ORPHAN LEAKED' end;

-- 3. Duplicate add also unwinds (ticker already exists, link is the duplicate).
do $$
begin
  perform public.add_watchlist_stock(1, 'AAPL');
  raise exception 'T3 FAIL: expected unique violation';
exception when unique_violation then
  null;
end $$;
select 'T3 duplicate rejected -> PASS';
select 'T3 catalog still has exactly one AAPL -> ' ||
  case when (select count(*) from public.stock_catalog where ticker='AAPL')=1 then 'PASS' else 'FAIL' end;

-- 4. Invalid ticker: rejected, nothing written.
do $$
begin
  perform public.add_watchlist_stock(1, '<|endoftext|>');
  raise exception 'T4 FAIL: expected invalid-ticker error';
exception when sqlstate '22023' then
  null;
end $$;
select 'T4 junk ticker rejected -> PASS';
select 'T4 catalog unchanged -> ' ||
  case when (select count(*) from public.stock_catalog)=1 then 'PASS' else 'FAIL' end;

-- 5. updated_at must NOT move when the catalog row already exists.
update public.stock_catalog set updated_at = '2020-01-01' where ticker='AAPL';
select public.add_watchlist_stock(3, 'AAPL') is not null;   -- fails: no watchlist 3
\set ME    '11111111-1111-1111-1111-111111111111'
\set OTHER '22222222-2222-2222-2222-222222222222'
\pset tuples_only on
\pset format unaligned
select set_config('test.uid', :'ME', false);

-- 5. An existing catalog row must keep its updated_at (the sweep reads it).
-- Measured before/after: an explicit updated_at cannot be used as a baseline
-- because the set_updated_at trigger overwrites it on any UPDATE.
create temp table baseline as
  select updated_at from public.stock_catalog where ticker='AAPL';
select pg_sleep(1.1);
select public.add_portfolio_holding(1, 'AAPL', 100, 150.5) is not null;
select 'T5 updated_at NOT bumped by ensure_stock -> ' ||
  case when (select s.updated_at from public.stock_catalog s where s.ticker='AAPL')
          = (select b.updated_at from baseline b)
       then 'PASS' else 'FAIL — sweep clock reset' end;

-- 6. Holding written correctly and returned.
select 'T6 holding row created -> ' ||
  case when (select count(*) from public.portfolio_holdings where ticker='AAPL' and shares=100)=1
       then 'PASS' else 'FAIL' end;
select 'T6 holding attributed to caller -> ' ||
  case when (select user_id from public.portfolio_holdings limit 1)::text = :'ME'
       then 'PASS' else 'FAIL' end;

-- 7. Holding on a foreign portfolio: rejected, and no orphan catalog row.
do $$ begin
  perform public.add_portfolio_holding(99, 'ZORPH', 1, 1);
  raise exception 'T7 FAIL: expected rejection';
exception when sqlstate '42501' then null; end $$;
select 'T7 foreign portfolio rejected -> PASS';
select 'T7 no orphan catalog row for ZORPH -> ' ||
  case when (select count(*) from public.stock_catalog where ticker='ZORPH')=0
       then 'PASS' else 'FAIL — ORPHAN LEAKED' end;

-- 8. service_role path: no auth.uid(), acts for the user it names.
select set_config('test.uid', '', false);
select 'T8 service_role add via p_user_id -> ' ||
  case when public.add_watchlist_stock(1, 'MSFT', :'ME'::uuid) > 0 then 'PASS' else 'FAIL' end;

-- 9. ...but it cannot be called with nobody at all.
do $$ begin
  perform public.add_watchlist_stock(1, 'NOBODY');
  raise exception 'T9 FAIL: expected rejection';
exception when sqlstate '42501' then null; end $$;
select 'T9 no acting user rejected -> PASS';
select 'T9 no orphan catalog row for NOBODY -> ' ||
  case when (select count(*) from public.stock_catalog where ticker='NOBODY')=0
       then 'PASS' else 'FAIL — ORPHAN LEAKED' end;

-- 10. auth.uid() must win over p_user_id, so a browser cannot act as someone else.
select set_config('test.uid', :'ME', false);
do $$ begin
  perform public.add_watchlist_stock(2, 'SPOOF', '22222222-2222-2222-2222-222222222222'::uuid);
  raise exception 'T10 FAIL: impersonation succeeded';
exception when sqlstate '42501' then null; end $$;
select 'T10 p_user_id cannot override auth.uid() -> PASS';

select 'FINAL catalog rows: ' || (select count(*)::text from public.stock_catalog) ||
       ' (expect 2: AAPL, MSFT)';
\set ME '11111111-1111-1111-1111-111111111111'
\pset tuples_only on
\pset format unaligned
select set_config('test.uid', :'ME', false);

-- Prove the trigger is what broke the previous attempt: an explicit
-- updated_at cannot survive an UPDATE on this table.
update public.stock_catalog set updated_at = '2020-01-01T00:00:00Z' where ticker='AAPL';
select 'T5a explicit updated_at is overwritten by the trigger -> ' ||
  case when (select updated_at from public.stock_catalog where ticker='AAPL') > '2020-01-02'
       then 'CONFIRMED (test was wrong, not the code)' else 'unexpected' end;

-- The real assertion: ensure_stock on an EXISTING row must not touch it.
create temp table baseline as
  select ticker, updated_at from public.stock_catalog where ticker='AAPL';
select pg_sleep(1.1);
select public.add_portfolio_holding(1, 'AAPL', 5, 10) is not null;
select 'T5b ensure_stock leaves updated_at untouched -> ' ||
  case when (select s.updated_at from public.stock_catalog s where s.ticker='AAPL')
          = (select b.updated_at from baseline b)
       then 'PASS' else 'FAIL — sweep clock reset' end;

-- And for contrast, a real UPDATE does move it, so the trigger is live.
select pg_sleep(1.1);
update public.stock_catalog set name='x' where ticker='AAPL';
select 'T5c a genuine update still bumps it (trigger live) -> ' ||
  case when (select s.updated_at from public.stock_catalog s where s.ticker='AAPL')
          > (select b.updated_at from baseline b)
       then 'PASS' else 'FAIL' end;
