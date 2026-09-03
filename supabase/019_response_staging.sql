-- ============================================================
-- VibeFin: write-through response staging
--
-- 017 staged four per-ticker families, written by DGX
-- (supabase_sync.reconcile_*). That covers the endpoints DGX knows how to
-- serialise into Supabase — and nothing else. The 2026-09-02 review found
-- the gap that leaves: the stock page gates on /api/stocks/{t}/detail, the
-- watchlist reads verdicts and PAM through POST batch routes, the portfolio
-- converts currency through /api/fx/rates, and the whole dashboard is macro
-- endpoints. None of those were staged, so a DGX outage still emptied every
-- page — including the pages whose *other* data was staged and ready.
--
-- Closing that gap by adding a table and a reconcile task per family does
-- not scale: each one is another writer on DGX that has to stay in step
-- with a route on Vercel, and it can only ever cover endpoints someone
-- remembered to add.
--
-- So this table is filled from the OTHER side. The Vercel proxy already
-- holds every successful response on its way to the browser; it writes a
-- copy here as it passes (src/lib/stagingCapture.ts) and reads it back when
-- the box stops answering (src/lib/staging.ts). The app therefore stages
-- exactly what it actually uses, at the freshness it actually uses it, with
-- no second serializer anywhere: the body stored is the body DGX sent.
--
-- WRITER: the Vercel proxy, service-role key, on a successful upstream 2xx.
-- READER: the same proxy's fallback path, service-role key.
--
-- ── Why nothing here is readable by anyone else ───────────────────────
--
-- 017's tables grant `select using (true)` — they hold per-ticker public
-- facts, so a public read is harmless. This table is keyed by REQUEST PATH,
-- and the safety of that depends entirely on an allowlist in application
-- code (PATH_FAMILIES in src/lib/stagingPaths.ts) never admitting a
-- user-scoped route. Application-code invariants are exactly the kind that
-- drift, and the cost of drift here would be one user's rows served to
-- another — the failure the 017 header warns about.
--
-- So there is no SELECT policy at all. RLS is on, only the service role has
-- a policy, and the sole reader is the server-side proxy, which uses the
-- service key anyway. A capture bug then costs a wasted row, not a leak.
--
-- ── Retention ─────────────────────────────────────────────────────────
--
-- Unlike 017 there is no cross-store reference to keep in step: every row
-- here is a cached response, not a mirror of a DGX record, so nothing is
-- stranded by a purge on the other side. A row stops being SERVED when it
-- passes its family's window (enforced at read time, per family, in the
-- proxy — a chain summary and an FX rate go wrong at very different
-- speeds). It stops EXISTING when prune_response_snapshots() drops it,
-- which is the ordinary "nothing has asked for this in a month" sweep.
--
-- Idempotent end to end — re-running is how a drifted environment is
-- brought back into line.
-- ============================================================

create table if not exists public.dgx_response_snapshot (
  -- Which kind of thing this is: 'path' for a whole GET response keyed by
  -- request path, or a per-ticker family decomposed out of a batch POST
  -- ('verdict-batch', 'pam-batch'). The family also selects the serving
  -- window on read.
  family      text not null,
  -- 'path'  → the normalised request path incl. query (see captureKey()).
  -- batch   → the ticker.
  key         text not null,
  -- The response body, byte-for-byte what DGX sent. No reshaping: the
  -- fallback is a read and a header, not a second serializer.
  body        jsonb not null,
  -- Best available age of the DATA. Most endpoints do not date themselves,
  -- in which case this is when we captured it — which is an upper bound on
  -- the data's freshness, never an under-statement of its age.
  as_of       timestamptz not null default now(),
  -- When this row was written. Drives the capture throttle and the sweep;
  -- deliberately separate from as_of, which is what the user is told.
  captured_at timestamptz not null default now(),
  primary key (family, key)
);

comment on table public.dgx_response_snapshot is
  'Write-through cache of DGX GET/batch responses, captured by the Vercel proxy and served back during an outage. Service-role only — see the header of 019 for why there is no public read policy.';
comment on column public.dgx_response_snapshot.as_of is
  'Age of the DATA where the endpoint dates itself, else the capture time. Never younger than the data actually is.';

-- The sweep scans by age; reads are always by primary key.
create index if not exists ix_response_snapshot_captured_at
  on public.dgx_response_snapshot(captured_at);

alter table public.dgx_response_snapshot enable row level security;

drop policy if exists "Service role can manage response snapshots"
  on public.dgx_response_snapshot;
create policy "Service role can manage response snapshots"
  on public.dgx_response_snapshot for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- And take the table grant away as well.
--
-- Supabase's default privileges hand anon and authenticated full table
-- access to anything created in `public`, which would leave the RLS policy
-- above as the SINGLE thing standing between a browser's anon key and this
-- table. One mistaken `for select using (true)` later — the shape every
-- other snapshot table in 017 legitimately has — and it is readable by
-- anyone. Revoking the grant means the policy is the second lock, not the
-- only one.
revoke all on public.dgx_response_snapshot from anon, authenticated;

-- ── The throttled write ────────────────────────────────────────────────
--
-- Every successful proxied response is a capture candidate, and the hot
-- ones repeat on a 60-second poll. Writing all of them would mean a
-- Supabase round trip per request for a row that changes far more slowly
-- than it is read.
--
-- The throttle has to be decided by the DATABASE, not by the caller: a
-- read-then-write from the proxy is two round trips and races every other
-- concurrent request for the same key. So the interval is a WHERE clause on
-- the upsert — one statement, no race, and losers are a no-op rather than a
-- conflict.
--
-- Returns true when the row was actually written, so the caller can log
-- capture volume without a second query.
create or replace function public.stage_dgx_response(
  p_family   text,
  p_key      text,
  p_body     jsonb,
  p_as_of    timestamptz,
  p_min_interval_seconds int default 600
) returns boolean
language plpgsql
security invoker
-- Empty search_path so every name resolves explicitly. These functions are
-- SECURITY INVOKER and only service_role may execute them, so the classic
-- definer-hijack is not available here — but Supabase's linter flags an
-- unset search_path on any function, and leaving a fresh warning behind on
-- new code is how the pre-existing ones accumulated. Everything below is
-- either schema-qualified or a pg_catalog builtin, which is always in scope.
set search_path = ''
as $$
declare
  v_written boolean;
begin
  insert into public.dgx_response_snapshot (family, key, body, as_of, captured_at)
  values (p_family, p_key, p_body, coalesce(p_as_of, now()), now())
  on conflict (family, key) do update
    set body        = excluded.body,
        as_of       = excluded.as_of,
        captured_at = now()
    -- Unqualified on purpose: inside ON CONFLICT DO UPDATE the existing row
    -- is addressed by the table's own name, and a schema-qualified
    -- reference is not in scope there.
    where dgx_response_snapshot.captured_at
          < now() - make_interval(secs => greatest(p_min_interval_seconds, 0))
  returning true into v_written;

  return coalesce(v_written, false);
end;
$$;

comment on function public.stage_dgx_response is
  'Upsert a captured DGX response, but only if the stored copy is older than p_min_interval_seconds. One statement so concurrent captures of the same key cannot race.';

-- Only the proxy writes here. authenticated/anon must not be able to plant
-- a body that the fallback would later serve to everyone.
revoke all on function public.stage_dgx_response(text, text, jsonb, timestamptz, int) from public;
revoke all on function public.stage_dgx_response(text, text, jsonb, timestamptz, int) from anon;
revoke all on function public.stage_dgx_response(text, text, jsonb, timestamptz, int) from authenticated;
grant execute on function public.stage_dgx_response(text, text, jsonb, timestamptz, int) to service_role;

-- ── The sweep ──────────────────────────────────────────────────────────
--
-- Age here means "nothing has asked for this in a month", not "this data is
-- stale" — staleness is enforced per family at read time, because the same
-- number of days means something different for an FX rate and an option
-- chain. A row past every family's window is dead weight either way.
create or replace function public.prune_response_snapshots(
  p_max_age interval default interval '30 days'
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.dgx_response_snapshot
   where captured_at < now() - p_max_age;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.prune_response_snapshots is
  'Drop captured responses nothing has refreshed inside p_max_age. Serving windows are enforced per family at read time, not here.';

revoke all on function public.prune_response_snapshots(interval) from public;
grant execute on function public.prune_response_snapshots(interval) to service_role;
