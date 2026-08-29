-- ============================================================
-- VibeFin: DGX snapshot tier (the staging plane)
--
-- These tables are NOT a copy of the DGX schema. Each one is shaped like
-- the API RESPONSE the Vercel proxy would have returned, so a fallback is
-- a read plus a header — no reshaping, no second serializer to keep in
-- step with the route.
--
-- Scope is deliberate: PER-TICKER endpoints only. The shared, precomputed
-- families (macro, cross-sectional ranked, options screener, multibagger
-- candidates, fx, signals/today) are already covered by the Cache-Control
-- middleware in backend/app/main.py and the Vercel edge cache, and they
-- are hot enough to actually be resident there. The ~400-name catalog is
-- mostly cold: a per-ticker response is almost never in the CDN when the
-- box goes dark, which is why it needs a durable copy instead.
--
-- FinVibe's Thoughts get NO table here. llm_analysis already mirrors
-- thoughts_json / thoughts_summary / thoughts_generated_at, which is the
-- whole of what /api/stocks/{t}/thoughts serves. The fallback assembles
-- the response from that row. Adding a second copy would create a third
-- writer on the same fact — the mistake this migration exists to avoid
-- repeating.
--
-- WRITER: DGX only, via the service-role key
--         (backend/app/tasks/supabase_sync.py, reconcile_*_to_supabase).
-- READER: the Vercel proxy fallback (src/lib/staging.ts), server-side,
--         plus authenticated clients for read-only diagnostics.
--
-- ── Retention, and why these tables can carry it ───────────────────────
--
-- Four stores have to agree: Supabase, DGX Postgres, Qdrant, the edge
-- cache. reconcile only ever upserts — it never deletes — so anything
-- staged here that is also under retention on DGX needs its TTL declared
-- on this side too, or the mirror slowly becomes the only place a purged
-- row still exists.
--
-- Of what is staged, two sources are under retention and both are purged
-- by the KEYED rule in scripts/purge_old_data.sh — "delete past the cutoff
-- ONLY where a newer row exists for the same key", i.e. the latest row per
-- key survives regardless of age:
--
--   model_results         KEYED on (ticker, model_type)
--   option_chain_summary  KEYED on (ticker)
--
-- These tables hold exactly one row per key — the latest — so they already
-- agree with that rule by construction. Ageing them out on a flat timer
-- would make Supabase *stricter* than DGX and delete rows DGX deliberately
-- keeps, which is the same drift in the other direction.
--
-- The reference that actually breaks is the key disappearing. Two axes:
--
--   1. Ticker removed from Supabase stock_catalog — handled by the
--      DECLARED foreign key below, on delete cascade. Enforced by the
--      database, so it cannot be forgotten.
--   2. Ticker removed from DGX watchlist_stocks while the Supabase
--      catalog row survives — a cross-database pointer with no constraint
--      possible. That is exactly the unenforced-reference shape that
--      stranded 30,317 osint_articles rows and poisoned Qdrant's event
--      pointers on 2026-08-25. It is handled by prune_snapshots_to_dgx()
--      in supabase_sync.py, which runs from the retention script's
--      cross-store section alongside repair_qdrant_events.py — one purge,
--      all four stores, or it is not retention.
--
-- Age is still enforced, but at READ time, in the proxy: each family has a
-- maximum staleness (STALE_LIMITS in src/lib/staging.ts) beyond which the
-- fallback declines to answer and the caller gets the real 502. A row past
-- its serving window stays here as evidence; it just stops being served.
-- HARD_TTL_DAYS in the prune task is the outer bound for rows nothing has
-- refreshed in half a year — dead keys, not stale ones.
-- ============================================================

-- ── 1. Verdict ─────────────────────────────────────────────────────────
-- GET /api/stocks/{ticker}/verdict  →  returns verdict_json verbatim.
-- Source: watchlist_stocks.verdict_json / verdict_updated_at (not purged).

create table if not exists public.stock_verdict_snapshot (
  ticker      text primary key
              references public.stock_catalog(ticker) on delete cascade,
  -- The response body, byte-for-byte what the route returns.
  verdict     jsonb not null,
  -- Promoted so list views and diagnostics can read state without
  -- deserialising the blob. Mirrors verdict->>'state'.
  state       text,
  confidence  float,
  -- When DGX computed it (verdict_updated_at), NOT when we copied it.
  -- Everything downstream — the X-FinVibe-Stale header, the banner, the
  -- staleness limit — measures against this.
  as_of       timestamptz not null,
  synced_at   timestamptz not null default now()
);

comment on table public.stock_verdict_snapshot is
  'Staged /api/stocks/{t}/verdict response. Written by DGX reconcile_verdicts_to_supabase; read only by the proxy fallback.';
comment on column public.stock_verdict_snapshot.as_of is
  'DGX watchlist_stocks.verdict_updated_at — the age of the DATA, not of the copy.';

-- ── 2. Price action (PAM) ──────────────────────────────────────────────
-- GET /api/stocks/{ticker}/price-action  →  returns price_action_detail.
-- Source: watchlist_stocks.price_action_detail (not purged). The blob
-- carries its own top-level as_of, which is what we key staleness on.

create table if not exists public.stock_price_action_snapshot (
  ticker        text primary key
                references public.stock_catalog(ticker) on delete cascade,
  price_action  jsonb not null,
  -- price_action->'synthesis'->>'setup' and ->>'direction_label'. Promoted
  -- for the same reason as verdict.state.
  setup           text,
  direction_label text,
  as_of         timestamptz not null,
  synced_at     timestamptz not null default now()
);

comment on table public.stock_price_action_snapshot is
  'Staged /api/stocks/{t}/price-action response (the PAM blob). as_of is the blob''s own as_of.';

-- ── 3. Option chain summary + IV rank ──────────────────────────────────
-- GET /api/options/{ticker}/summary  →  chain analytics card + iv_rank.
-- Source: option_chain_summary (the EOD row the screener already reads),
-- KEYED-purged on DGX; iv_rank recomputed from iv_history at push time.
--
-- This is the one family where stale is genuinely dangerous: an option
-- chain from three days ago read as live is a wrong trade, not a stale
-- number. It is staged anyway — an empty Options tab tells the user
-- nothing — but it carries the shortest serving window of any family
-- (STALE_LIMITS.optionSummary) and the banner is not dismissible on it.

create table if not exists public.stock_option_summary_snapshot (
  ticker      text primary key
              references public.stock_catalog(ticker) on delete cascade,
  summary     jsonb not null,
  -- Promoted: the two numbers the screener and the income preset filter on.
  iv_rank         float,
  atm_iv_30d_pct  float,
  -- DGX option_chain_summary.updated_at — the EOD prefetch, not our copy.
  as_of       timestamptz not null,
  synced_at   timestamptz not null default now()
);

comment on table public.stock_option_summary_snapshot is
  'Staged /api/options/{t}/summary response. Shortest serving window of any snapshot family — an old chain read as live is a wrong trade.';

-- ── 4. Model results (latest per model_type) ───────────────────────────
-- GET /api/models/{ticker}/results  →  ModelResultOut[], one per model_type.
-- Source: model_results, KEYED-purged on (ticker, model_type) — this table
-- holds one array per ticker containing exactly the latest per type, which
-- is the same set that rule preserves.

create table if not exists public.stock_model_results_snapshot (
  ticker      text primary key
              references public.stock_catalog(ticker) on delete cascade,
  -- The response body: a JSON ARRAY of ModelResultOut objects.
  results     jsonb not null,
  n_models    int,
  -- max(run_at) across the array.
  as_of       timestamptz not null,
  synced_at   timestamptz not null default now()
);

comment on table public.stock_model_results_snapshot is
  'Staged /api/models/{t}/results response — latest row per model_type, matching the KEYED retention rule on DGX.';

-- ── Indexes ────────────────────────────────────────────────────────────
-- Reads are by ticker (the primary key). These support the prune sweep and
-- the freshness section of the health check, which scan by age.

create index if not exists ix_verdict_snapshot_as_of
  on public.stock_verdict_snapshot(as_of);
create index if not exists ix_price_action_snapshot_as_of
  on public.stock_price_action_snapshot(as_of);
create index if not exists ix_option_summary_snapshot_as_of
  on public.stock_option_summary_snapshot(as_of);
create index if not exists ix_model_results_snapshot_as_of
  on public.stock_model_results_snapshot(as_of);

-- ── RLS ────────────────────────────────────────────────────────────────
-- Read-only to everyone who can read stock_catalog; writable only by the
-- service role. Note the asymmetry with stock_catalog, which grants
-- authenticated INSERT — that grant is what made the enrichment queue
-- forgeable (see 018). Nothing here is user-writable at all.

alter table public.stock_verdict_snapshot       enable row level security;
alter table public.stock_price_action_snapshot  enable row level security;
alter table public.stock_option_summary_snapshot enable row level security;
alter table public.stock_model_results_snapshot enable row level security;

create policy "Anyone can read verdict snapshots"
  on public.stock_verdict_snapshot for select using (true);
create policy "Service role can manage verdict snapshots"
  on public.stock_verdict_snapshot for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Anyone can read price action snapshots"
  on public.stock_price_action_snapshot for select using (true);
create policy "Service role can manage price action snapshots"
  on public.stock_price_action_snapshot for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Anyone can read option summary snapshots"
  on public.stock_option_summary_snapshot for select using (true);
create policy "Service role can manage option summary snapshots"
  on public.stock_option_summary_snapshot for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Anyone can read model results snapshots"
  on public.stock_model_results_snapshot for select using (true);
create policy "Service role can manage model results snapshots"
  on public.stock_model_results_snapshot for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
