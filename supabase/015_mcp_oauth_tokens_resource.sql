-- ============================================================
-- RFC 8707: Store resource indicator on OAuth tokens
--
-- Migration 014 added resource to mcp_oauth_codes (authorization codes),
-- but it needs to be stored on mcp_oauth_tokens too so that token
-- validation can enforce the resource binding per RFC 8707.
-- ============================================================

alter table public.mcp_oauth_tokens
  add column if not exists resource text;
