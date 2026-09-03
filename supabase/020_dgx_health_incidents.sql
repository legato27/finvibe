-- ============================================================
-- VibeFin: DGX outage incidents, and alerting exactly once
--
-- 019 made an outage survivable. It did not make anyone AWARE of one — the
-- staging tier is deliberately quiet, so the better it works the less
-- anybody notices the box is dead. The 7h19m outage on 2026-08-25 was found
-- by a person opening the app. This is the table that stops that.
--
-- ── The hard part is not detecting, it is not shouting ─────────────────
--
-- Detection is free: the proxy already knows, because every fallback it
-- serves is evidence. The problem is that a dead box produces a FLOOD of
-- that evidence — the dashboard alone fires ten requests a minute per open
-- tab, each one a separate serverless invocation with no memory of the
-- others. Naively alerting from there is a pager storm, and a pager storm
-- is functionally the same as no alert at all.
--
-- So "is this a new outage" has to be decided somewhere all those
-- invocations can agree, which means the database:
--
--   * a partial unique index allows AT MOST ONE open incident to exist, so
--     the first failing request creates it and every other one loses the
--     race harmlessly (`on conflict do nothing`);
--   * the right to send the alert is CLAIMED by an update that only
--     succeeds once (`where notified_at is null`), so exactly one
--     invocation sends, even if fifty are inside the function together.
--
-- If the send then fails, the claim is released and the next failing
-- request tries again — see release_dgx_notification(). Claiming before
-- sending risks silence; sending before claiming risks a storm. Claiming
-- with a release on failure is the only arrangement that risks neither.
--
-- WRITER / READER: the Vercel proxy and the heartbeat route, service-role.
--
-- Idempotent end to end.
-- ============================================================

create table if not exists public.dgx_health_incident (
  id                   bigint generated always as identity primary key,
  -- When the box was first observed unreachable, and when it last was.
  -- The gap between them is the outage duration in the recovery message.
  started_at           timestamptz not null default now(),
  last_seen_down_at    timestamptz not null default now(),
  -- Null while the incident is open. Exactly one row may have this null.
  resolved_at          timestamptz,
  -- What actually failed, for the alert body. The path is often the most
  -- useful single fact: a whole-box outage and one wedged endpoint look
  -- identical in a count and completely different in a path.
  detail               text,
  path                 text,
  -- 'traffic' (a real request fell back) or 'heartbeat' (the scheduled
  -- probe). Worth keeping: an incident only ever seen by the heartbeat
  -- happened while nobody was using the app.
  source               text,
  -- Claim stamps. Set when an invocation takes responsibility for sending;
  -- cleared again if that send fails.
  notified_at          timestamptz,
  resolved_notified_at timestamptz
);

comment on table public.dgx_health_incident is
  'One row per DGX outage. The partial unique index below is what makes "is this a new outage" answerable across concurrent serverless invocations.';

-- At most one open incident, enforced by the database rather than by
-- application code that cannot see its own siblings. Indexing a constant is
-- the trick: every open row collides with every other open row.
create unique index if not exists ux_dgx_incident_open
  on public.dgx_health_incident ((true)) where resolved_at is null;

create index if not exists ix_dgx_incident_started
  on public.dgx_health_incident(started_at desc);

alter table public.dgx_health_incident enable row level security;

drop policy if exists "Service role can manage dgx incidents"
  on public.dgx_health_incident;
create policy "Service role can manage dgx incidents"
  on public.dgx_health_incident for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Readable by signed-in users so the status can be shown in the app; the
-- rows carry no user data, only "the backend was down from X to Y".
drop policy if exists "Signed-in users can read dgx incidents"
  on public.dgx_health_incident;
create policy "Signed-in users can read dgx incidents"
  on public.dgx_health_incident for select
  to authenticated using (true);

revoke all on public.dgx_health_incident from anon;

-- ── Opening an incident ────────────────────────────────────────────────
--
-- Returns `should_notify` true to exactly ONE caller per outage. Everyone
-- else gets false and writes nothing but a timestamp.
create or replace function public.record_dgx_down(
  p_detail text,
  p_path   text,
  p_source text default 'traffic'
) returns table (incident_id bigint, is_new boolean, should_notify boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_new boolean := false;
  v_claim boolean := false;
begin
  insert into public.dgx_health_incident (detail, path, source)
  values (p_detail, p_path, p_source)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    v_new := true;
  else
    -- Someone else already opened it. Touch the existing row so the
    -- recovery message can say how long this actually lasted.
    update public.dgx_health_incident
       set last_seen_down_at = now(),
           detail = coalesce(p_detail, detail),
           path   = coalesce(p_path, path)
     where resolved_at is null
    returning id into v_id;
  end if;

  if v_id is null then
    -- The open incident was resolved between the insert and the update.
    -- Rare, and the next failing request will open a fresh one.
    return query select null::bigint, false, false;
    return;
  end if;

  -- Claim the send. Succeeds for one caller only, and only while nobody
  -- has claimed it — including across a retry after a failed send.
  update public.dgx_health_incident
     set notified_at = now()
   where id = v_id and notified_at is null
  returning true into v_claim;

  return query select v_id, v_new, coalesce(v_claim, false);
end;
$$;

comment on function public.record_dgx_down is
  'Open or touch the single open outage incident. should_notify is true for exactly one caller per outage.';

-- ── Closing it ─────────────────────────────────────────────────────────
--
-- Returns the incident that was closed, so the caller can send an
-- all-clear that says how long it lasted. Returns nothing when there was
-- no open incident, which is the overwhelmingly common case — this is
-- called on the recovery path, not on every success.
create or replace function public.record_dgx_up()
returns table (
  incident_id bigint,
  started_at timestamptz,
  duration_seconds integer,
  should_notify boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_started timestamptz;
  v_claim boolean := false;
begin
  update public.dgx_health_incident
     set resolved_at = now()
   where resolved_at is null
  returning id, public.dgx_health_incident.started_at into v_id, v_started;

  if v_id is null then
    return;
  end if;

  update public.dgx_health_incident
     set resolved_notified_at = now()
   where id = v_id and resolved_notified_at is null
  returning true into v_claim;

  return query
    select v_id, v_started,
           extract(epoch from (now() - v_started))::integer,
           coalesce(v_claim, false);
end;
$$;

comment on function public.record_dgx_up is
  'Close the open incident, if any, and claim the all-clear message.';

-- ── Releasing a claim after a failed send ──────────────────────────────
--
-- Without this, a webhook that times out costs you the entire alert: the
-- claim is taken, nothing is delivered, and every later invocation is told
-- someone else has it in hand.
create or replace function public.release_dgx_notification(
  p_incident_id bigint,
  p_resolved    boolean default false
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_resolved then
    update public.dgx_health_incident
       set resolved_notified_at = null
     where id = p_incident_id;
  else
    update public.dgx_health_incident
       set notified_at = null
     where id = p_incident_id;
  end if;
end;
$$;

comment on function public.release_dgx_notification is
  'Undo a notification claim when the send failed, so a later invocation retries it.';

revoke all on function public.record_dgx_down(text, text, text) from public, anon, authenticated;
revoke all on function public.record_dgx_up() from public, anon, authenticated;
revoke all on function public.release_dgx_notification(bigint, boolean) from public, anon, authenticated;
grant execute on function public.record_dgx_down(text, text, text) to service_role;
grant execute on function public.record_dgx_up() to service_role;
grant execute on function public.release_dgx_notification(bigint, boolean) to service_role;
