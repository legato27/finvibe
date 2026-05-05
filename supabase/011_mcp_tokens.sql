-- ============================================================
-- MCP personal access tokens
--
-- One row per token. Secret is only the sha256 hash; the plaintext
-- is shown to the user once at creation and never persisted.
-- token_prefix is a short, masked display string (e.g. "vbf_a1b2c3d4…ef90")
-- so users can identify a token in the UI without seeing the secret.
-- ============================================================

create table if not exists public.mcp_tokens (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  token_hash    text not null unique,
  token_prefix  text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists ix_mcp_tokens_user
  on public.mcp_tokens(user_id);

create index if not exists ix_mcp_tokens_hash_active
  on public.mcp_tokens(token_hash)
  where revoked_at is null;

alter table public.mcp_tokens enable row level security;

create policy "Users manage own mcp tokens"
  on public.mcp_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
