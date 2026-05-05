-- ============================================================
-- RFC 8707: Resource Indicators for OAuth 2.0
--
-- Some MCP clients (Claude.ai included) require the access token to be
-- bound to the specific protected resource URL passed in the authorize
-- request. Capture it on the auth code and echo it back in the token
-- response.
-- ============================================================

alter table public.mcp_oauth_codes
  add column if not exists resource text;
