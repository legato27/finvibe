-- ============================================================
-- MCP OAuth 2.1 + PKCE + Dynamic Client Registration
--
-- Three tables:
--   mcp_oauth_clients  — apps registered via DCR (Claude Desktop, Cursor, …)
--   mcp_oauth_codes    — short-lived authorization codes
--   mcp_oauth_tokens   — access + refresh tokens (sha256 hashes)
--
-- Personal access tokens (mcp_tokens, migration 011) are unaffected and
-- continue to work side-by-side. The MCP route accepts both.
-- ============================================================

create table if not exists public.mcp_oauth_clients (
  id                          text primary key,            -- client_id (random)
  client_secret_hash          text,                        -- nullable for public/PKCE-only
  client_name                 text not null,
  redirect_uris               text[] not null,
  grant_types                 text[] not null default array['authorization_code','refresh_token'],
  token_endpoint_auth_method  text not null default 'none',
  created_at                  timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code                   text primary key,
  client_id              text not null references public.mcp_oauth_clients(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  redirect_uri           text not null,
  code_challenge         text not null,
  code_challenge_method  text not null,
  scope                  text,
  expires_at             timestamptz not null,
  consumed_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists ix_mcp_oauth_codes_unconsumed
  on public.mcp_oauth_codes(code) where consumed_at is null;

create table if not exists public.mcp_oauth_tokens (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  client_id             text not null references public.mcp_oauth_clients(id) on delete cascade,
  access_token_hash     text not null unique,
  access_token_prefix   text not null,
  refresh_token_hash    text unique,
  scope                 text,
  access_expires_at     timestamptz not null,
  refresh_expires_at    timestamptz,
  created_at            timestamptz not null default now(),
  last_used_at          timestamptz,
  revoked_at            timestamptz
);
create index if not exists ix_mcp_oauth_tokens_user
  on public.mcp_oauth_tokens(user_id);
create index if not exists ix_mcp_oauth_tokens_access_active
  on public.mcp_oauth_tokens(access_token_hash) where revoked_at is null;
create index if not exists ix_mcp_oauth_tokens_refresh_active
  on public.mcp_oauth_tokens(refresh_token_hash) where revoked_at is null;

-- RLS — clients table is "global" (read-only to authenticated users for the
-- consent screen; only service_role writes). Codes and tokens are per-user.

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes   enable row level security;
alter table public.mcp_oauth_tokens  enable row level security;

create policy "Authenticated read clients"
  on public.mcp_oauth_clients for select to authenticated using (true);
create policy "Service role writes clients"
  on public.mcp_oauth_clients for all to service_role using (true);

create policy "Users see own oauth codes"
  on public.mcp_oauth_codes for select using (auth.uid() = user_id);

create policy "Users see own oauth tokens"
  on public.mcp_oauth_tokens for select using (auth.uid() = user_id);
create policy "Users revoke own oauth tokens"
  on public.mcp_oauth_tokens for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
