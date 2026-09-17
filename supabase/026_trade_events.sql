-- 026: the trade journal keeps a timestamped activity log.
--
-- Every row in options_trades records what a trade IS; this table records
-- what HAPPENED to it and when: logged, filled, closed, expired, assigned,
-- exited, a note. Timestamps, not dates — entry_date / close_date stay for
-- the options arithmetic (DTE, days held) but say nothing about the minute
-- a trade was written down or settled. Writers: the web journal, the MCP
-- tools (log_trade / resolve_trade, which the desk routine uses) and the
-- crypto paper broker on the box (service role). Readers: the journal
-- panel's activity list and list_trades.
--
-- Options rows also gain entry_ts / exit_ts going forward (the columns exist
-- since 025 and were only filled for crypto rows); the backfill below stamps
-- existing rows from created_at / updated_at and writes one event per row so
-- the history has a timeline from day one.

create table if not exists public.trade_events (
  id bigint generated always as identity primary key,
  trade_id bigint not null references public.options_trades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('opened', 'filled', 'closed', 'expired', 'assigned', 'exited', 'note')),
  actor text not null default 'web',   -- web | mcp | paper-broker
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_trade_events_trade on public.trade_events (trade_id, at);
create index if not exists ix_trade_events_user_at on public.trade_events (user_id, at desc);

alter table public.trade_events enable row level security;

create policy "Users can view their own trade events"
  on public.trade_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own trade events"
  on public.trade_events for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own trade events"
  on public.trade_events for delete
  using (auth.uid() = user_id);

-- Backfill: options rows get the timestamps they never had. created_at is
-- the moment the trade was logged; updated_at is the last write, which for a
-- settled row is its close (a note edited later would move it — marked
-- backfilled so a reader can tell).
update public.options_trades
   set entry_ts = coalesce(entry_ts, created_at)
 where asset_class = 'options' and entry_ts is null;

update public.options_trades
   set exit_ts = coalesce(exit_ts, updated_at)
 where asset_class = 'options' and status <> 'open' and exit_ts is null;

insert into public.trade_events (trade_id, user_id, at, kind, actor, detail)
select t.id, t.user_id, coalesce(t.entry_ts, t.created_at),
       case when t.asset_class = 'crypto' then 'filled' else 'opened' end,
       case when t.asset_class = 'crypto' then 'paper-broker'
            when t.outcome_notes like '[desk-routine%' then 'mcp' else 'web' end,
       jsonb_build_object('backfilled', true, 'entry_px', coalesce(t.entry_px, t.underlying_price_at_entry))
  from public.options_trades t
 where not exists (select 1 from public.trade_events e where e.trade_id = t.id);

insert into public.trade_events (trade_id, user_id, at, kind, actor, detail)
select t.id, t.user_id, coalesce(t.exit_ts, t.updated_at),
       case when t.asset_class = 'crypto' then 'exited' else t.status end,
       case when t.asset_class = 'crypto' then 'paper-broker'
            when t.outcome_notes like '[desk-routine%' then 'mcp' else 'web' end,
       jsonb_build_object('backfilled', true, 'exit_reason', t.exit_reason, 'exit_px', coalesce(t.exit_px, t.close_price),
                          'realized_pnl', t.realized_pnl, 'r_realised', t.r_realised)
  from public.options_trades t
 where t.status <> 'open'
   and not exists (select 1 from public.trade_events e where e.trade_id = t.id and e.kind <> 'opened' and e.kind <> 'filled');
