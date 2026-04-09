-- ============================================================
-- VibeFin: LLM Analysis & FinVibe's Thoughts
-- New table for LLM-generated stock analysis data
-- ============================================================

-- ── 1. LLM Analysis table ──────────────────────────────────────

create table public.llm_analysis (
  id bigint generated always as identity primary key,
  ticker text unique not null,
  -- LLM-inferred metadata (filled on stock add if quant data missing)
  llm_sector text,
  llm_moat text check (llm_moat in ('Wide', 'Narrow', 'None')),
  llm_description text,
  llm_intrinsic_value float,
  llm_margin_of_safety float,
  -- FinVibe's Thoughts (weekly generation on DGX)
  thoughts_json jsonb,
  thoughts_summary text,
  thoughts_generated_at timestamptz,
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index ix_llm_analysis_ticker on public.llm_analysis(ticker);

-- ── 2. Add description column to stock_catalog ─────────────────

alter table public.stock_catalog add column if not exists description text;

-- ── 3. Updated_at trigger for llm_analysis ─────────────────────

create trigger set_updated_at before update on public.llm_analysis
  for each row execute function public.update_updated_at();

-- ── 4. RLS policies ────────────────────────────────────────────

alter table public.llm_analysis enable row level security;

-- Public read access (no auth needed — FinVibe's Thoughts are public)
create policy "Anyone can read LLM analysis"
  on public.llm_analysis for select
  using (true);

-- Only service role can write (DGX backend syncs data)
create policy "Service role can manage LLM analysis"
  on public.llm_analysis for all
  using (auth.role() = 'service_role');
