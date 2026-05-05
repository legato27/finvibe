-- ============================================================
-- Track which user manually registered each MCP OAuth client.
--
-- Clients registered via DCR (RFC 7591) leave this NULL — they're
-- "global", anyone who completes the OAuth flow against them gets a
-- token tied to their own user.
--
-- Clients registered via the in-app /api/mcp/oauth/clients endpoint
-- (the manual "Add a connected app" form on /settings/mcp/oauth)
-- store the registering user's id so the UI can surface them
-- immediately, before any OAuth grant exists.
-- ============================================================

alter table public.mcp_oauth_clients
  add column if not exists created_by_user_id uuid references auth.users(id) on delete cascade;

create index if not exists ix_mcp_oauth_clients_created_by
  on public.mcp_oauth_clients(created_by_user_id);

-- Allow the registering user to delete their own client (and via FK cascade,
-- any tokens issued to that client). Prior policies already let any
-- authenticated user read clients (needed for the consent screen) and let
-- service_role do anything.
create policy "Users delete own oauth clients"
  on public.mcp_oauth_clients for delete
  using (auth.uid() = created_by_user_id);
