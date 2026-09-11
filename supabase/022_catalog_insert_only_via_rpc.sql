-- ── The browser stops writing to the catalog ───────────────────────────
--
-- 018 replaced `with check (true)` with "Users can register a blank ticker",
-- narrowing what a client could put in a stock_catalog row to a bare ticker
-- and nothing else. That was the right shape while the browser still created
-- the row itself: adding a stock meant inserting the shared catalog row, then
-- inserting the link, from the client, in two round trips.
--
-- 021 moved both writes inside add_watchlist_stock / add_portfolio_holding, so
-- they commit together or not at all. Nothing in src/ has inserted into
-- stock_catalog since — the only INSERT left anywhere is inside
-- public.ensure_stock, which those two functions call.
--
-- The policy therefore grants a capability the application no longer uses, and
-- it is the last way left to produce the thing 021 exists to prevent: a signed
-- -in user with the browser's anon key can still plant a blank row that no
-- watchlist and no holding references. Rows like that are invisible to every
-- sweep, because the sweeps reach rows through a user's watchlists and
-- holdings. MVRL sat that way for eight days.
--
-- So: drop it, and let the RPC be the only way in rather than merely the
-- conventional one.
--
-- WHY THE FUNCTIONS STILL WORK WITHOUT IT, which is not obvious and is the
-- thing to re-check if this ever breaks: SECURITY DEFINER does not bypass RLS
-- on its own. It makes current_user the function owner, and a table's OWNER
-- bypasses RLS — but only while the table does not have FORCE ROW LEVEL
-- SECURITY set. add_watchlist_stock, add_portfolio_holding, ensure_stock and
-- stock_catalog all share an owner, and stock_catalog has relforcerowsecurity
-- = false, so the insert inside the function is not policy-checked.
--
-- If anyone ever runs `alter table public.stock_catalog force row level
-- security`, or recreates these functions under a different owner, the adds
-- will start failing on a policy that no longer exists. Restore this policy or
-- add one scoped to the function owner.
--
-- Verified on a local harness reproducing RLS, the 018 policy and 021: the RPC
-- added a stock before the drop and after it, while a direct blank insert as
-- `authenticated` succeeded before and raised insufficient_privilege after.
--
-- SELECT is untouched — the catalog is shared reference data and the whole app
-- reads it. Rows created under the old policy are untouched too; this changes
-- who may create new ones, not what exists.

drop policy if exists "Users can register a blank ticker" on public.stock_catalog;

comment on table public.stock_catalog is
  'Shared stock reference data. DGX is the sole writer of the descriptive fields; rows are created only by public.ensure_stock, inside the add RPCs in 021. Clients read it and nothing more.';
