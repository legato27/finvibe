-- ============================================================
-- MCP token scopes
-- Adds a `scope` to personal access tokens so a token can be limited
-- to read-only, or read + manage-own-watchlists/portfolios, instead of
-- always granting the full toolset.
--
--   full   → every tool (default; keeps existing tokens working unchanged)
--   manage → read tools + writes to the user's own watchlists/portfolios/holdings
--   read   → read-only tools only
--
-- Enforcement is server-side in src/lib/mcp/tools.ts (registerTools) via
-- scopeAllows() in src/lib/mcp/catalog.ts.
-- ============================================================

alter table public.mcp_tokens
  add column if not exists scope text not null default 'full'
  check (scope in ('full', 'manage', 'read'));

comment on column public.mcp_tokens.scope is
  'MCP toolset scope: full | manage | read. Enforced in registerTools().';
