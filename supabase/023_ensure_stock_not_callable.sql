-- ── ensure_stock stops being reachable from outside ────────────────────
--
-- 021 revoked it from public, anon and authenticated, and its own comment
-- claimed it was "not granted separately". That was not true of service_role:
-- Supabase grants that role broadly by default, the revoke never named it, and
-- it kept execute. The first probe of 021 against the live project called it
-- directly and created ZZNOPE — a catalog row with nothing linking it, which
-- is precisely the orphan 021 and 022 exist to prevent — and it had to be
-- deleted by hand.
--
-- It was never a privilege escalation. service_role has full table access to
-- stock_catalog through PostgREST, so the function offered it nothing a plain
-- insert would not. It was a footgun sitting on the one path that still had
-- rights to write that table, and the code said it was closed when it was not.
--
-- Nothing calls it directly: not src/, not the MCP server, not DGX. Its only
-- callers are add_watchlist_stock and add_portfolio_holding, from inside their
-- own transactions, after their ownership checks.
--
-- The wrappers keep working because they are SECURITY DEFINER: current_user
-- inside them is the function owner, so the nested call is checked against the
-- OWNER's execute privilege, not the caller's. Revoking from every other role
-- leaves the owner's intact. Verified on a harness — with ensure_stock revoked
-- from service_role, a service_role caller still completed an add through
-- add_watchlist_stock while a direct call to ensure_stock raised
-- insufficient_privilege.
--
-- After this, the only way to create a stock_catalog row is the two add RPCs,
-- from any role, through their ownership checks, atomically with the link.

revoke all on function public.ensure_stock(text) from service_role;

comment on function public.ensure_stock is
  'Get or create the shared catalog row. DO NOTHING + SELECT so an existing row keeps its updated_at, which the enrichment sweep reads. Not executable by any role: called only from add_watchlist_stock / add_portfolio_holding, which run as owner.';
