-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.stock_catalog enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.portfolio_holdings enable row level security;
alter table public.stock_notes enable row level security;

-- ── Profiles ────────────────────────────────────────────────
-- Users can read/update their own profile
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── Stock Catalog (shared, read by all, write by service role) ──
-- All authenticated users can read stock catalog
create policy "Authenticated users can read stocks"
  on public.stock_catalog for select to authenticated using (true);

-- Only service_role (DGX backend) can insert/update stocks
create policy "Service role can manage stocks"
  on public.stock_catalog for all to service_role using (true);

-- Authenticated users can insert new stocks (when adding to watchlist)
create policy "Users can insert new stocks"
  on public.stock_catalog for insert to authenticated with check (true);

-- ── Watchlists ──────────────────────────────────────────────
-- Users see only their own watchlists
create policy "Users manage own watchlists"
  on public.watchlists for all using (auth.uid() = user_id);

-- ── Watchlist Items ─────────────────────────────────────────
-- Users can manage items in their own watchlists
create policy "Users manage own watchlist items"
  on public.watchlist_items for all using (
    watchlist_id in (
      select id from public.watchlists where user_id = auth.uid()
    )
  );

-- ── Portfolio Holdings ──────────────────────────────────────
create policy "Users manage own holdings"
  on public.portfolio_holdings for all using (auth.uid() = user_id);

-- ── Stock Notes ─────────────────────────────────────────────
create policy "Users manage own notes"
  on public.stock_notes for all using (auth.uid() = user_id);
