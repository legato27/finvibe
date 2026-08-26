-- ============================================================
-- VibeFin: enrichment requests — a real queue, with an owner
--
-- ── What was wrong ────────────────────────────────────────────────────
--
-- The enrichment queue was a column on a shared table. 002_rls_policies.sql
-- grants:
--
--     create policy "Users can insert new stocks"
--       on public.stock_catalog for insert to authenticated with check (true);
--
-- and poll_pending_stocks on DGX picked up ANY row with
-- enrichment_status = 'pending', from anyone, with no notion of who asked.
-- So the super-admin gate on POST /api/enrich gated nothing: a logged-in
-- user never had to call it. One insert with the anon key — which the
-- browser holds — enqueued the full pipeline: prices, financials, moat,
-- DCF, ETF mapping, GPU quant models and an LLM pass, per ticker, with no
-- ceiling. `with check (true)` also let that same insert carry any values
-- it liked into the SHARED catalog: a name, a sector, an intrinsic value.
--
-- ── What this does ────────────────────────────────────────────────────
--
--   1. Moves the queue to its own table, with requested_by not null. A
--      request now has an author, a cap, and an audit trail.
--   2. Caps it per user, in a trigger, because RLS cannot count rows it is
--      about to insert. Service-role inserts (auth.uid() is null — the DGX
--      worker and the super-admin path through /api/enrich) are exempt.
--   3. Narrows the stock_catalog insert grant from `true` to "a blank row
--      for a plausible ticker". Users may still add an unknown symbol to a
--      watchlist; they may no longer author facts about it.
--
-- Note what is deliberately NOT here: no ban on ordinary users requesting
-- enrichment. The cap is the control, not the gate — a user who adds a
-- stock to their watchlist should get it enriched. What changes is that
-- the work is attributable and bounded. If the intent is instead that only
-- super-admins may ever trigger the pipeline, set both caps to 0 in
-- public.enrichment_request_caps() — everything else keeps working, and
-- non-admin requests come back as 'capped' rather than silently doing
-- nothing.
--
-- ── The reverse-direction contract ────────────────────────────────────
--
-- DGX reads this table (poll_enrichment_requests in supabase_sync.py) and
-- is the only writer of `status` after insert. The 180 s poll drops to a
-- 10-minute backstop; the fast path is a Supabase DB webhook on INSERT →
-- /api/hooks/enrichment-request on Vercel → the DGX tunnel. The tunnel
-- INBOUND stayed healthy on every day the OUTBOUND polls failed with
-- Errno -3, so the push direction is the one that has actually been
-- reliable here.
-- ============================================================

-- ── 1. The queue ───────────────────────────────────────────────────────

create table if not exists public.enrichment_requests (
  id            bigint generated always as identity primary key,
  ticker        text not null,
  -- Not null on purpose: an unattributable request is what we are fixing.
  -- Service-role inserts must still name the user they act for; the
  -- super-admin path passes its own id.
  requested_by  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'queued'
                check (status in ('queued', 'processing', 'done', 'failed', 'rejected')),
  -- Why it failed / was rejected. Surfaced to the requester, who can see
  -- their own rows.
  reason        text,
  -- 'web' | 'mcp' | 'admin' — which surface asked. Cheap attribution for
  -- when the cap starts biting and someone needs to know why.
  source        text not null default 'web',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  picked_up_at  timestamptz,
  completed_at  timestamptz
);

-- One open request per ticker, globally. Enrichment is idempotent and
-- catalog-wide: ten users adding NVDA in the same minute is one unit of
-- GPU work, not ten. A partial unique index expresses that without
-- blocking a later re-request once the first has settled.
create unique index if not exists ux_enrichment_requests_open
  on public.enrichment_requests(ticker)
  where status in ('queued', 'processing');

-- The poller's read path: oldest queued first.
create index if not exists ix_enrichment_requests_queued
  on public.enrichment_requests(status, created_at)
  where status in ('queued', 'processing');

-- The cap's read path, and "show me my requests".
create index if not exists ix_enrichment_requests_user
  on public.enrichment_requests(requested_by, created_at desc);

create trigger set_updated_at before update on public.enrichment_requests
  for each row execute function public.update_updated_at();

comment on table public.enrichment_requests is
  'Attributable, capped queue for DGX enrichment. Replaces stock_catalog.enrichment_status=''pending'' as the work signal.';

-- ── 2. The cap ─────────────────────────────────────────────────────────
--
-- The numbers live in ONE function, because they are enforced in two places
-- — the trigger below (for direct inserts) and file_enrichment_request in
-- section 5 (the supported path) — and two copies of a limit is two limits
-- that will eventually disagree. Change them here and both follow.
--
--   requests_per_day  what one user may open in a rolling 24 h
--   max_in_flight     what one user may have queued or processing at once
--
-- Set BOTH to 0 to make enrichment super-admin-only again: ordinary asks
-- then come back as 'capped' — visible and explainable — rather than
-- silently doing nothing, which is how the old design failed.

create or replace function public.enrichment_request_caps(
  out requests_per_day int,
  out max_in_flight int
)
language sql
immutable
as $$ select 20, 3 $$;

comment on function public.enrichment_request_caps() is
  'Per-user enrichment limits. Single source for both the insert trigger and file_enrichment_request(). Set both to 0 for admin-only.';

-- A trigger, not a policy: RLS WITH CHECK sees one row and cannot count
-- what the user already has. SECURITY DEFINER so the count sees every row
-- regardless of the caller's RLS view — otherwise a user could hide their
-- own history from the counter.

create or replace function public.enforce_enrichment_request_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_cap      int;
  concurrent_cap int;
  uid            uuid := auth.uid();
  n_recent       int;
  n_open         int;
begin
  select requests_per_day, max_in_flight
    into daily_cap, concurrent_cap
    from public.enrichment_request_caps();

  -- Service role (DGX, and the super-admin path through /api/enrich, both
  -- of which run with the service key) has no auth.uid(). Uncapped by
  -- design: that path is already gated in application code and is how a
  -- backfill of the whole catalog gets requested.
  if uid is null then
    return new;
  end if;

  -- A user may only file requests in their own name. Belt and braces with
  -- the RLS policy below — this trigger also runs for service-role inserts
  -- that pass a uid, and catches the same mistake there.
  if new.requested_by <> uid then
    raise exception 'enrichment request must be filed under the requesting user'
      using errcode = '42501';
  end if;

  select count(*) into n_recent
    from public.enrichment_requests
   where requested_by = uid
     and created_at > now() - interval '24 hours';

  if n_recent >= daily_cap then
    raise exception
      'enrichment request cap reached (% in the last 24h, limit %)', n_recent, daily_cap
      using errcode = '54000';  -- program_limit_exceeded
  end if;

  select count(*) into n_open
    from public.enrichment_requests
   where requested_by = uid
     and status in ('queued', 'processing');

  if n_open >= concurrent_cap then
    raise exception
      'too many enrichment requests in flight (%, limit %) — wait for one to finish',
      n_open, concurrent_cap
      using errcode = '54000';
  end if;

  return new;
end;
$$;

create trigger enforce_enrichment_request_cap
  before insert on public.enrichment_requests
  for each row execute function public.enforce_enrichment_request_cap();

-- ── 3. RLS ─────────────────────────────────────────────────────────────

alter table public.enrichment_requests enable row level security;

-- Read your own requests — enough to show "queued / processing / failed"
-- next to the ticker you asked for, and nothing about anyone else's.
create policy "Users read own enrichment requests"
  on public.enrichment_requests for select to authenticated
  using (requested_by = auth.uid());

-- File a request in your own name, in the initial state, for a plausible
-- symbol. status/reason/timestamps are DGX's to write, not the client's.
create policy "Users file own enrichment requests"
  on public.enrichment_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'queued'
    and reason is null
    and picked_up_at is null
    and completed_at is null
    and source in ('web', 'mcp')
    and ticker = upper(ticker)
    and ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'
  );

-- Deliberately no UPDATE or DELETE policy for authenticated. A requester
-- cannot mark their own request done, retry it by flipping it back to
-- 'queued', or delete it to escape the 24 h counter.

create policy "Service role manages enrichment requests"
  on public.enrichment_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── 4. Narrow the stock_catalog insert grant ───────────────────────────
--
-- Still permitted: "this symbol is not in the shared catalog yet, create a
-- blank row so I can put it in my watchlist". No longer permitted: filling
-- in fields DGX owns. The regex is the same one src/lib/mcp/db.ts applies
-- in application code (TICKER_RE) — it existed to keep LLM special-token
-- leakage like "<|...|>" out of the catalog, and until now the database
-- itself did not enforce it on the path the browser actually uses.

drop policy if exists "Users can insert new stocks" on public.stock_catalog;

create policy "Users can register a blank ticker"
  on public.stock_catalog for insert to authenticated
  with check (
    ticker = upper(ticker)
    and ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'
    and enrichment_status = 'pending'
    and name is null
    and sector is null
    and industry is null
    and description is null
    and moat_rating is null
    and moat_confidence is null
    and moat_detail is null
    and intrinsic_value is null
    and margin_of_safety is null
    and wacc is null
    and last_price is null
    and last_price_updated_at is null
    and ten_yr_low is null
    and ten_yr_high is null
    and quarterly_trend is null
    and yearly_trend is null
    and etf_memberships is null
  );

comment on policy "Users can register a blank ticker" on public.stock_catalog is
  'Replaces `with check (true)`. A client may create the row; only DGX may describe it. enrichment_status is now a display state, not a work queue — see enrichment_requests.';

-- ── 5. One way in ──────────────────────────────────────────────────────
--
-- Both surfaces that can ask for enrichment — the web route /api/enrich and
-- the MCP server — go through this function rather than inserting directly.
--
-- The reason is the service-role key. MCP tools authenticate with a bearer
-- token and then act through the service client, where auth.uid() is null,
-- so the cap trigger above would wave them through: a user with an MCP
-- token could enqueue without limit, which is the same unbounded queue this
-- migration exists to close, reached by a different door. This function
-- counts against the user named in p_user regardless of which key called it,
-- so the cap holds on every path.
--
-- SECURITY DEFINER so the counts see all rows (a requester's own RLS view
-- shows only their own — which is what we want to count, but relying on the
-- view would mean a policy change silently changes the cap). The guard
-- below is what stops a session client from filing under someone else's id:
-- auth.uid() still reflects the caller's JWT inside a definer function.
--
-- Returns one of: 'filed' | 'already_open' | 'capped' | 'invalid_ticker'.
-- Never raises for the ordinary refusals — the callers turn these into a
-- per-ticker outcome, and an add-to-watchlist should not fail because the
-- enrichment behind it was declined.

create or replace function public.file_enrichment_request(
  p_ticker text,
  p_user   uuid,
  p_source text default 'web'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_cap int;
  concurrent_cap int;
  uid       uuid := auth.uid();
  tk        text := upper(trim(p_ticker));
  n_recent  int;
  n_open    int;
begin
  select requests_per_day, max_in_flight
    into daily_cap, concurrent_cap
    from public.enrichment_request_caps();

  if uid is not null and p_user <> uid then
    raise exception 'cannot file an enrichment request for another user'
      using errcode = '42501';
  end if;
  if p_source not in ('web', 'mcp', 'admin') then
    raise exception 'unknown enrichment request source: %', p_source
      using errcode = '22023';
  end if;
  if tk !~ '^[A-Z0-9][A-Z0-9.-]{0,14}$' then
    return 'invalid_ticker';
  end if;

  -- Idempotent by ticker, not by user. Enrichment is catalog-wide: ten
  -- people adding NVDA in the same minute is one unit of GPU work. This
  -- also means a piggy-backed request costs the second user nothing
  -- against their cap, which is the correct incentive.
  if exists (select 1 from public.enrichment_requests
              where ticker = tk and status in ('queued', 'processing')) then
    return 'already_open';
  end if;

  select count(*) into n_recent
    from public.enrichment_requests
   where requested_by = p_user
     and created_at > now() - interval '24 hours';
  if n_recent >= daily_cap then
    return 'capped';
  end if;

  select count(*) into n_open
    from public.enrichment_requests
   where requested_by = p_user
     and status in ('queued', 'processing');
  if n_open >= concurrent_cap then
    return 'capped';
  end if;

  begin
    insert into public.enrichment_requests (ticker, requested_by, status, source)
    values (tk, p_user, 'queued', p_source);
  exception when unique_violation then
    -- Lost the race against a concurrent filer. Same answer either way:
    -- the work is queued.
    return 'already_open';
  end;
  return 'filed';
end;
$$;

revoke all on function public.file_enrichment_request(text, uuid, text) from public;
grant execute on function public.file_enrichment_request(text, uuid, text)
  to authenticated, service_role;

comment on function public.file_enrichment_request(text, uuid, text) is
  'The only supported way to enqueue enrichment. Caps by p_user regardless of the calling key, so the MCP service-role path is bounded too.';

-- ── 6. Backfill: adopt whatever the old queue was still holding ────────
--
-- Rows sitting at 'pending' were the old queue's contents. Once DGX stops
-- reading that column they would never be picked up again — a silent drop
-- of work someone asked for. There is no requested_by to recover (that is
-- the whole point), so these are adopted by the catalog's oldest admin
-- profile if one exists, and left alone otherwise rather than invented.
--
-- Safe to re-run: the partial unique index makes a second attempt a no-op.

insert into public.enrichment_requests (ticker, requested_by, status, source)
select sc.ticker,
       (select id from public.profiles order by created_at limit 1),
       'queued',
       'admin'
  from public.stock_catalog sc
 where sc.enrichment_status = 'pending'
   and exists (select 1 from public.profiles)
   and not exists (
     select 1 from public.enrichment_requests er
      where er.ticker = sc.ticker
        and er.status in ('queued', 'processing')
   )
on conflict do nothing;
