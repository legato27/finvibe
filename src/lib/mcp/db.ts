// Server-side CRUD for MCP tools.
//
// CRITICAL: every function takes `userId` as the first arg and MUST filter
// every query by that user_id (or scope through an owned parent row).
// The supabase client here is the service-role client, which bypasses RLS.
// Forgetting the user_id filter would let one user touch another user's data.

import type { ServiceSupabase } from "@/lib/supabase/service";
import { market } from "./market";
import { pooledMap } from "@/lib/util/pool";

function tickerOf(t: string): string {
  return t.trim().toUpperCase();
}

// Plausible symbol: alphanumeric start, then [A-Z0-9.-], max 15 chars. Covers US
// tickers, SGX (O39.SI), crypto (BTC-USD), class shares (BRK.B). Rejects LLM
// special-token leakage (e.g. "<|...|>") that previously polluted stock_catalog.
const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
function assertValidTicker(t: string): string {
  const norm = tickerOf(t);
  if (!TICKER_RE.test(norm)) throw new Error(`Invalid ticker symbol: ${JSON.stringify(t)}`);
  return norm;
}

// Request enrichment from DGX. DGX is the single source of truth for stock
// details + enrichment_status and the SOLE writer of the Supabase stock_catalog
// / llm_analysis mirror. The web/MCP clients only ever (1) create the 'pending'
// request row (getOrCreateStock) and (2) call this to kick the pipeline — they
// no longer pull DGX's view and write fields/status themselves. That old
// dual-writer design (two engines racing on the same rows, with different field
// sets and different meanings of "done") is what made the two databases
// disagree. DGX's /watchlist/enrich is idempotent and:
//   - ensures its local row + runs the full pipeline,
//   - mirrors name/sector/price early (status stays 'processing'),
//   - pushes the full stock + llm projection once, at the end (status 'done'),
//   - and a periodic reconcile task backstops any missed push.
export async function kickoffEnrichment(
  _supabase: ServiceSupabase,
  ticker: string,
  isSuperAdmin: boolean,
): Promise<{ kicked: boolean; error?: string; skipped?: boolean }> {
  // The enrichment pipeline (DGX) is super-admin only. For everyone else this
  // is a no-op so add/sweep flows still succeed — they just don't enrich.
  if (!isSuperAdmin) return { kicked: false, skipped: true };
  try {
    await market.enrich(ticker);
    return { kicked: true };
  } catch (err) {
    console.error(`[mcp] enrich ${ticker} failed`, err);
    return { kicked: false, error: String(err).slice(0, 200) };
  }
}

// ── The enrichment queue ───────────────────────────────────
//
// Enrichment used to be requested by writing enrichment_status='pending'
// onto the shared stock_catalog row, which DGX's poller treated as a work
// queue. Combined with `for insert to authenticated with check (true)`,
// that made the super-admin gate on /api/enrich decorative: a logged-in
// user never had to call it — one insert with the browser's anon key
// enqueued the full GPU/LLM pipeline, unattributed and unbounded.
//
// Requests now live in public.enrichment_requests, and the only supported
// way in is the file_enrichment_request RPC (supabase/018), which caps by
// the user named in the call regardless of which key made it. That last
// detail matters here: this module talks to Supabase with the SERVICE-ROLE
// client, where auth.uid() is null, so an application-side gate would be
// the only thing standing between an MCP token and an unbounded queue.
// Putting the cap in the function instead means it holds on both paths.

export type EnrichmentOutcome =
  | "filed"          // queued; DGX will pick it up
  | "already_open"   // someone already asked for this ticker
  | "capped"         // this user is at their limit
  | "invalid_ticker"
  | "error";

export async function fileEnrichmentRequest(
  supabase: ServiceSupabase,
  ticker: string,
  userId: string,
  source: "web" | "mcp" | "admin",
): Promise<{ ticker: string; outcome: EnrichmentOutcome; error?: string }> {
  const t = tickerOf(ticker);
  const { data, error } = await supabase.rpc("file_enrichment_request", {
    p_ticker: t,
    p_user: userId,
    p_source: source,
  });
  if (error) {
    console.error(`[enrich] filing ${t} failed`, error.message);
    return { ticker: t, outcome: "error", error: error.message.slice(0, 200) };
  }
  return { ticker: t, outcome: (data as EnrichmentOutcome) ?? "error" };
}

// Find tickers across the user's watchlists + portfolio holdings whose
// stock_catalog rows are still stuck enriching. "Stuck" means:
//   - enrichment_status = 'pending', OR
//   - enrichment_status = 'processing' but updated_at is older than the
//     STALE_PROCESSING_MIN cutoff (DGX worker probably dropped the ball).
const STALE_PROCESSING_MIN = 10;

export async function findStaleEnrichmentTickers(
  userId: string,
  supabase: ServiceSupabase,
  limit = 25,
): Promise<string[]> {
  const cutoff = new Date(
    Date.now() - STALE_PROCESSING_MIN * 60_000,
  ).toISOString();

  // Watchlist tickers via watchlists → watchlist_items → stock_catalog.
  const { data: wl } = await supabase
    .from("watchlists")
    .select("watchlist_items(stock_catalog(ticker, enrichment_status, updated_at))")
    .eq("user_id", userId);

  // Portfolio tickers — direct user_id filter on portfolio_holdings, then
  // join stock_catalog by ticker (separate query since holdings store the
  // ticker text, not a stock_id).
  const { data: holdings } = await supabase
    .from("portfolio_holdings")
    .select("ticker")
    .eq("user_id", userId);

  const out = new Set<string>();
  for (const w of wl ?? []) {
    const items = (w as { watchlist_items?: Array<{ stock_catalog?: { ticker?: string; enrichment_status?: string; updated_at?: string } | null }> }).watchlist_items ?? [];
    for (const it of items) {
      const sc = it?.stock_catalog;
      if (!sc?.ticker) continue;
      if (sc.enrichment_status === "pending") out.add(sc.ticker);
      else if (
        sc.enrichment_status === "processing" &&
        sc.updated_at &&
        sc.updated_at < cutoff
      )
        out.add(sc.ticker);
    }
  }

  const holdingTickers = (holdings ?? [])
    .map((h: { ticker?: string }) => h.ticker)
    .filter((t): t is string => !!t);
  if (holdingTickers.length) {
    const { data: stocks } = await supabase
      .from("stock_catalog")
      .select("ticker, enrichment_status, updated_at")
      .in("ticker", [...new Set(holdingTickers)]);
    for (const s of stocks ?? []) {
      const sc = s as { ticker: string; enrichment_status?: string; updated_at?: string };
      if (sc.enrichment_status === "pending") out.add(sc.ticker);
      else if (
        sc.enrichment_status === "processing" &&
        sc.updated_at &&
        sc.updated_at < cutoff
      )
        out.add(sc.ticker);
    }
  }

  return [...out].slice(0, limit);
}

// ── Orphan catalog rows ────────────────────────────────────
//
// Every add is a non-atomic two-step: insert the shared stock_catalog row,
// then insert the link (watchlist_items, or a portfolio_holdings row keyed by
// ticker text). If the second step never happens — the request dies, the tab
// closes, the process is killed — the catalog row survives referenced by
// nobody.
//
// That row is then invisible to every sweep on this file, because both
// findStaleEnrichmentTickers and ownedTickers reach rows THROUGH a user's
// watchlists and holdings. An unreferenced row has no user, so no sweep can
// ever see it and it stays 'pending' forever. MVRL sat that way for 8 days
// with created_at still equal to updated_at.
//
// The fix is to reap, not to enrich. Enriching a row nobody references would
// spend real GPU and LLM time — enrichment_status is a display state, but
// fileEnrichmentRequest queues actual work — on data no user is looking at,
// and it would have to be billed to a user who never asked for it. Deleting
// costs nothing: getOrCreateStock recreates the row the moment anyone adds the
// ticker again.
//
// Only provably-worthless rows qualify, and all four conditions matter:
//   - enrichment_status 'pending' and name IS NULL — never enriched, so it
//     holds nothing worth keeping and has no snapshot rows to cascade into.
//     Orphans that reached 'done' are LEFT ALONE: 76 of the 77 orphans in the
//     catalog are exactly that, tickers someone watchlisted and later removed,
//     and their data is a warm cache for the next person who adds them.
//   - older than ORPHAN_MIN_AGE_MIN — an add completes in seconds, so an hour
//     is far outside any in-flight window.
//   - absent from watchlist_items AND from portfolio_holdings. Both checks are
//     load-bearing: watchlist_items.stock_id has a foreign key that would
//     refuse the delete, but portfolio_holdings.ticker is plain text with no
//     constraint at all, so nothing in the database would stop us orphaning a
//     live holding.
const ORPHAN_MIN_AGE_MIN = 60;

export async function reapOrphanCatalogRows(
  supabase: ServiceSupabase,
  limit = 25,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MIN * 60_000).toISOString();

  const { data: blank } = await supabase
    .from("stock_catalog")
    .select("id, ticker")
    .eq("enrichment_status", "pending")
    .is("name", null)
    .lt("created_at", cutoff)
    .limit(limit);

  const rows = (blank ?? []) as Array<{ id: number; ticker: string }>;
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const tickers = rows.map((r) => r.ticker);

  const [{ data: linked }, { data: held }] = await Promise.all([
    supabase.from("watchlist_items").select("stock_id").in("stock_id", ids),
    supabase.from("portfolio_holdings").select("ticker").in("ticker", tickers),
  ]);

  const linkedIds = new Set((linked ?? []).map((r: { stock_id: number }) => r.stock_id));
  const heldTickers = new Set(
    (held ?? []).map((r: { ticker: string }) => (r.ticker ?? "").toUpperCase()),
  );

  const doomed = rows.filter(
    (r) => !linkedIds.has(r.id) && !heldTickers.has((r.ticker ?? "").toUpperCase()),
  );
  if (!doomed.length) return [];

  // Re-assert the qualifying conditions in the delete itself. Between the
  // select above and this statement someone could have added the ticker, and
  // DGX could have started enriching it — the status/name predicates mean such
  // a row no longer matches and is left alone rather than deleted from under
  // them.
  const { data: deleted, error } = await supabase
    .from("stock_catalog")
    .delete()
    .in("id", doomed.map((r) => r.id))
    .eq("enrichment_status", "pending")
    .is("name", null)
    .select("ticker");
  if (error) {
    // A foreign-key refusal here is the watchlist_items constraint doing its
    // job on a row that got linked mid-flight. Nothing to recover: the row is
    // now owned, which is the outcome we wanted anyway.
    console.warn("[enrich] orphan reap failed", error.message);
    return [];
  }
  return (deleted ?? []).map((r: { ticker: string }) => r.ticker);
}

// True when supabase/021_atomic_adds.sql has not been applied yet.
//
// CAVEAT worth knowing before trusting this: PostgREST resolves a function by
// name AND parameter names, and answers PGRST202 for both "no such function"
// and "that function exists but not with those arguments". They are
// indistinguishable from here — verified against the live project, where
// calling the real file_enrichment_request with the wrong arguments returned
// exactly the same code as a function that does not exist.
//
// So a renamed parameter would look like a missing migration and silently
// route every add back through the two-step, forever, with 021 applied and
// unused. Hence the warning: a fallback is a temporary state and should be
// audible, not invisible. It never routes around a function that RAN and
// raised — those carry the PL/pgSQL error code instead.
//
// Exists so either deploy order is safe: the app can ship before 021 is
// applied, or after. Once it is applied everywhere, this and the two-step
// branches below can go.
function rpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (error?.code !== "PGRST202") return false;
  console.warn(
    `[add] atomic add RPC unavailable, falling back to the two-step: ${error.message ?? ""}`,
  );
  return true;
}

// Undo a blank catalog row created moments ago by an add that then failed.
//
// The reaper below is the backstop for rows nobody can reach; this is the
// first line, closing the window instead of waiting an hour to clean up after
// it. Same safety predicates, minus the age gate — the caller knows it created
// this row seconds ago, so waiting would defeat the point.
//
// The unreferenced check is NOT redundant with "I just made it". Between the
// insert and the failure another user's add can link the same shared row, and
// a portfolio_holdings row would not stop the delete on its own because that
// column has no foreign key. Deleting then would take out someone else's
// holding to tidy up our own failure.
//
// Callers must treat this as best-effort and must not let it mask the error
// that triggered it: the add already failed, and the user needs to see why.
export async function discardBlankCatalogRow(
  supabase: ServiceSupabase,
  ticker: string,
): Promise<boolean> {
  const t = tickerOf(ticker);

  const { data: row } = await supabase
    .from("stock_catalog")
    .select("id")
    .eq("ticker", t)
    .eq("enrichment_status", "pending")
    .is("name", null)
    .maybeSingle();
  if (!row) return false;

  const id = (row as { id: number }).id;
  const [{ data: linked }, { data: held }] = await Promise.all([
    supabase.from("watchlist_items").select("stock_id").eq("stock_id", id).limit(1),
    supabase.from("portfolio_holdings").select("ticker").eq("ticker", t).limit(1),
  ]);
  if ((linked ?? []).length || (held ?? []).length) return false;

  // Predicates repeated in the delete: DGX may have started describing the row
  // between the read above and here, and a row it is filling in is no longer
  // ours to discard.
  const { data: deleted } = await supabase
    .from("stock_catalog")
    .delete()
    .eq("id", id)
    .eq("enrichment_status", "pending")
    .is("name", null)
    .select("ticker");
  return (deleted ?? []).length > 0;
}

// Re-kick enrichment for the user's stale tickers. Both the web /api/enrich
// route and the MCP list_watchlists path delegate here so they agree on
// what "stale" means and how it gets recovered.
export async function sweepUserEnrichment(
  userId: string,
  supabase: ServiceSupabase,
  isSuperAdmin: boolean,
  limit = 25,
): Promise<{
  enriched: string[]; queued: string[]; capped: string[]; failed: string[];
  reaped: string[];
}> {
  // Orphans belong to no user, so there is no per-user sweep that could pick
  // them up and no cron on this project to hang them off — vercel.json carries
  // no schedule and the last one was deliberately removed. This sweep is the
  // only thing that both holds a service-role client and runs periodically, so
  // the reap rides along here. It is bounded, idempotent, and touches nothing
  // any user can see.
  const reaped = await reapOrphanCatalogRows(supabase);

  const tickers = await findStaleEnrichmentTickers(userId, supabase, limit);
  if (!tickers.length) return { enriched: [], queued: [], capped: [], failed: [], reaped };

  // File first, always. Even for a super admin: the request row is what makes
  // the work attributable and what the poller falls back to if the direct
  // kick below cannot reach the box. The cap in the RPC is what stops a
  // sweep from becoming an unbounded fan-out.
  const filed = await pooledMap(tickers, 5, (t) =>
    fileEnrichmentRequest(supabase, t, userId, "web"),
  );

  const queued: string[] = [];
  const capped: string[] = [];
  const failed: string[] = [];
  const kickable: string[] = [];
  filed.forEach((r, i) => {
    const t = tickers[i];
    if (!r) { failed.push(t); return; }
    if (r.outcome === "filed") { queued.push(t); kickable.push(t); }
    else if (r.outcome === "already_open") kickable.push(t);
    else if (r.outcome === "capped") capped.push(t);
    else failed.push(t);
  });

  // Super admins additionally get the immediate kick, so an admin sweep does
  // not wait on the webhook. Everyone else's requests are driven by the
  // Supabase DB webhook, with the 10-minute poll behind it.
  if (!isSuperAdmin || !kickable.length) {
    return { enriched: [], queued, capped, failed, reaped };
  }
  const results = await pooledMap(kickable, 5, (t) =>
    kickoffEnrichment(supabase, t, isSuperAdmin),
  );
  const enriched: string[] = [];
  results.forEach((r, i) => {
    // A failed kick is not a failed request — the row stays 'queued' and the
    // poller retries. Only report what actually started.
    if (r?.kicked) enriched.push(kickable[i]);
  });
  return { enriched, queued, capped, failed, reaped };
}

// ── Profile ────────────────────────────────────────────────

export async function getProfile(userId: string, supabase: ServiceSupabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, default_currency")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Watchlists ─────────────────────────────────────────────

export async function listWatchlists(userId: string, supabase: ServiceSupabase) {
  const { data, error } = await supabase
    .from("watchlists")
    .select("*, watchlist_items(*, stock_catalog(*))")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { name: string; description?: string },
) {
  const { data, error } = await supabase
    .from("watchlists")
    .insert({ user_id: userId, name: args.name, description: args.description ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number },
) {
  // Ownership check — service role bypasses RLS so we must filter explicitly.
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", args.watchlist_id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { deleted: true, watchlist_id: args.watchlist_id };
}

async function assertWatchlistOwned(
  userId: string,
  supabase: ServiceSupabase,
  watchlistId: number,
) {
  const { data, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("id", watchlistId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Watchlist ${watchlistId} not found`);
}

// `created` tells the caller whether it owns the cleanup if its own insert
// fails next. Rolling back a row that was already in the catalog would delete
// a shared row this add merely read.
async function getOrCreateStock(
  supabase: ServiceSupabase,
  ticker: string,
): Promise<{ id: number; ticker: string; created: boolean }> {
  const t = assertValidTicker(ticker);
  const existing = await supabase
    .from("stock_catalog")
    .select("id, ticker")
    .eq("ticker", t)
    .maybeSingle();
  if (existing.data) return { ...(existing.data as { id: number; ticker: string }), created: false };

  // A blank row. enrichment_status is a DISPLAY state now, not a work queue —
  // nothing schedules off it, so this creates a badge, not a GPU hour. The
  // RLS policy in 018 enforces the same blankness for browser inserts.
  const { data, error } = await supabase
    .from("stock_catalog")
    .insert({ ticker: t, enrichment_status: "pending" })
    .select("id, ticker")
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as { id: number; ticker: string }), created: true };
}

export async function addToWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number; ticker: string },
  isSuperAdmin: boolean,
) {
  await assertWatchlistOwned(userId, supabase, args.watchlist_id);

  // One statement, so the catalog row and the link commit together. The RPC
  // re-checks ownership itself — it is SECURITY DEFINER and cannot trust its
  // caller — so assertWatchlistOwned above is belt and braces, and the one
  // that produces the friendlier message.
  //
  // Both branches below converge on the same `stock`, so the enrichment tail
  // and the response shape are written once. An RPC branch with its own return
  // would drift from the fallback's the first time either changed.
  let stock: { id: number; ticker: string };

  const viaRpc = await supabase.rpc("add_watchlist_stock", {
    p_watchlist_id: args.watchlist_id,
    p_ticker: args.ticker,
    p_user_id: userId,
  });

  if (!viaRpc.error) {
    stock = { id: viaRpc.data as number, ticker: assertValidTicker(args.ticker) };
  } else if (!rpcMissing(viaRpc.error)) {
    throw new Error(viaRpc.error.message);
  } else {
    // ── Fallback: 021 not applied yet.
    const created = await getOrCreateStock(supabase, args.ticker);
    const { error } = await supabase
      .from("watchlist_items")
      .insert({ watchlist_id: args.watchlist_id, stock_id: created.id });
    if (error) {
      // The catalog row exists only because this call was about to link it.
      // Leaving it behind is what produces an orphan no sweep can reach.
      if (created.created) {
        await discardBlankCatalogRow(supabase, created.ticker).catch(() => false);
      }
      throw new Error(error.message);
    }
    stock = created;
  }

  // File the request before kicking. The row is what makes the work
  // attributable and capped, and what the DGX poller retries from if the
  // direct kick below cannot reach the box.
  const request = await fileEnrichmentRequest(supabase, stock.ticker, userId, "mcp");
  const enrichment =
    request.outcome === "filed" || request.outcome === "already_open"
      ? await kickoffEnrichment(supabase, stock.ticker, isSuperAdmin)
      : { kicked: false, skipped: true as const };

  return {
    watchlist_id: args.watchlist_id,
    ticker: stock.ticker,
    stock_id: stock.id,
    enrichment: {
      ...enrichment,
      request: request.outcome,
      note:
        "Enrichment requested from DGX (the source of truth). Name/sector/price " +
        "mirror to stock_catalog within seconds; moat, Fair Value " +
        "(intrinsic_value), LLM intrinsic value and thoughts follow in 30-90s as " +
        "DGX completes and syncs. enrichment_status flips pending → processing → " +
        "done; this client no longer writes those fields itself. " +
        "`request` reports whether the ask was queued, already open for this " +
        "ticker, or declined because the requester is at their per-user cap.",
    },
  };
}

export async function removeFromWatchlist(
  userId: string,
  supabase: ServiceSupabase,
  args: { watchlist_id: number; ticker: string },
) {
  await assertWatchlistOwned(userId, supabase, args.watchlist_id);
  const t = tickerOf(args.ticker);
  const { data: stock, error: stockErr } = await supabase
    .from("stock_catalog")
    .select("id")
    .eq("ticker", t)
    .maybeSingle();
  if (stockErr) throw new Error(stockErr.message);
  if (!stock) return { removed: 0 };

  const { error, count } = await supabase
    .from("watchlist_items")
    .delete({ count: "exact" })
    .eq("watchlist_id", args.watchlist_id)
    .eq("stock_id", stock.id);
  if (error) throw new Error(error.message);
  return { removed: count ?? 0, watchlist_id: args.watchlist_id, ticker: t };
}

// ── Portfolios ─────────────────────────────────────────────

export async function listPortfolios(userId: string, supabase: ServiceSupabase) {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPortfolio(
  userId: string,
  supabase: ServiceSupabase,
  args: { name: string; description?: string },
) {
  const { data, error } = await supabase
    .from("portfolios")
    .insert({ user_id: userId, name: args.name, description: args.description ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePortfolio(
  userId: string,
  supabase: ServiceSupabase,
  args: { portfolio_id: number },
) {
  const { error } = await supabase
    .from("portfolios")
    .delete()
    .eq("id", args.portfolio_id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { deleted: true, portfolio_id: args.portfolio_id };
}

async function assertPortfolioOwned(
  userId: string,
  supabase: ServiceSupabase,
  portfolioId: number,
) {
  const { data, error } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Portfolio ${portfolioId} not found`);
}

export async function getPortfolio(
  userId: string,
  supabase: ServiceSupabase,
  args: { portfolio_id: number },
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);

  const { data: portfolio, error: pErr } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", args.portfolio_id)
    .single();
  if (pErr) throw new Error(pErr.message);

  const { data: holdings, error: hErr } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("portfolio_id", args.portfolio_id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (hErr) throw new Error(hErr.message);

  const tickers = [...new Set((holdings ?? []).map((h: any) => h.ticker))];
  let stockMap: Record<string, any> = {};
  if (tickers.length) {
    const { data: stocks } = await supabase
      .from("stock_catalog")
      .select("ticker, name, last_price, last_price_updated_at, sector")
      .in("ticker", tickers);
    for (const s of stocks ?? []) stockMap[(s as any).ticker] = s;
  }

  const enriched = (holdings ?? []).map((h: any) => {
    const stock = stockMap[h.ticker];
    const current_price = stock?.last_price ?? null;
    const mkt_value = current_price != null ? Number(h.shares) * Number(current_price) : null;
    const cost_value = Number(h.shares) * Number(h.cost_basis);
    const unrealized_pnl = mkt_value != null ? mkt_value - cost_value : null;
    return {
      id: h.id,
      ticker: h.ticker,
      name: stock?.name ?? null,
      sector: stock?.sector ?? null,
      shares: Number(h.shares),
      cost_basis: Number(h.cost_basis),
      currency: (h.currency || "USD").toUpperCase(),
      acquired_date: h.acquired_date,
      broker: h.broker,
      notes: h.notes,
      current_price,
      last_price_updated_at: stock?.last_price_updated_at ?? null,
      mkt_value,
      cost_value,
      unrealized_pnl,
    };
  });

  const total_value = enriched.reduce(
    (sum, h) => sum + (h.mkt_value ?? h.cost_value),
    0,
  );
  const withWeights = enriched.map((h) => ({
    ...h,
    weight_pct: total_value > 0 ? ((h.mkt_value ?? h.cost_value) / total_value) * 100 : 0,
  }));

  const total_cost = enriched.reduce((sum, h) => sum + h.cost_value, 0);
  const total_unrealized_pnl = withWeights.reduce(
    (sum, h) => sum + (h.unrealized_pnl ?? 0),
    0,
  );

  return {
    portfolio,
    holdings: withWeights,
    totals: {
      value: total_value,
      cost: total_cost,
      unrealized_pnl: total_unrealized_pnl,
      lot_count: withWeights.length,
    },
  };
}

// ── Holdings ───────────────────────────────────────────────

export async function addHolding(
  userId: string,
  supabase: ServiceSupabase,
  args: {
    portfolio_id: number;
    ticker: string;
    shares: number;
    cost_basis: number;
    acquired_date?: string;
    broker?: string;
    notes?: string;
    currency?: string;
  },
  isSuperAdmin: boolean,
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);

  // As in addToWatchlist: one statement when 021 is present, the old two-step
  // plus rollback when it is not, and both leave `data` holding the inserted
  // row so everything downstream is written once.
  const ticker = assertValidTicker(args.ticker);
  let data: unknown;

  const viaRpc = await supabase.rpc("add_portfolio_holding", {
    p_portfolio_id: args.portfolio_id,
    p_ticker: ticker,
    p_shares: args.shares,
    p_cost_basis: args.cost_basis,
    p_acquired_date: args.acquired_date ?? null,
    p_broker: args.broker ?? null,
    p_notes: args.notes ?? null,
    p_currency: (args.currency ?? "USD").toUpperCase(),
    p_user_id: userId,
  });

  if (!viaRpc.error) {
    data = viaRpc.data;
  } else if (!rpcMissing(viaRpc.error)) {
    throw new Error(viaRpc.error.message);
  } else {
    // ── Fallback: 021 not applied yet.
    const stock = await getOrCreateStock(supabase, args.ticker);
    const inserted = await supabase
      .from("portfolio_holdings")
      .insert({
        user_id: userId,
        portfolio_id: args.portfolio_id,
        ticker: stock.ticker,
        shares: args.shares,
        cost_basis: args.cost_basis,
        acquired_date: args.acquired_date ?? null,
        broker: args.broker ?? null,
        notes: args.notes ?? null,
        currency: (args.currency ?? "USD").toUpperCase(),
      })
      .select()
      .single();
    if (inserted.error) {
      // Same contract as addToWatchlist: the blank row was created for this
      // holding, so this call owns discarding it.
      if (stock.created) {
        await discardBlankCatalogRow(supabase, stock.ticker).catch(() => false);
      }
      throw new Error(inserted.error.message);
    }
    data = inserted.data;
  }

  // `ticker` rather than the row's: both branches normalised it the same way,
  // and it is in scope regardless of which one ran.
  await kickoffEnrichment(supabase, ticker, isSuperAdmin);

  return data;
}

export async function updateHolding(
  userId: string,
  supabase: ServiceSupabase,
  args: {
    holding_id: number;
    shares?: number;
    cost_basis?: number;
    acquired_date?: string | null;
    broker?: string | null;
    notes?: string | null;
  },
) {
  const patch: Record<string, unknown> = {};
  if (args.shares !== undefined) patch.shares = args.shares;
  if (args.cost_basis !== undefined) patch.cost_basis = args.cost_basis;
  if (args.acquired_date !== undefined) patch.acquired_date = args.acquired_date;
  if (args.broker !== undefined) patch.broker = args.broker;
  if (args.notes !== undefined) patch.notes = args.notes;

  const { data, error } = await supabase
    .from("portfolio_holdings")
    .update(patch)
    .eq("id", args.holding_id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteHolding(
  userId: string,
  supabase: ServiceSupabase,
  args: { holding_id: number },
) {
  const { error, count } = await supabase
    .from("portfolio_holdings")
    .delete({ count: "exact" })
    .eq("id", args.holding_id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!count) throw new Error(`Holding ${args.holding_id} not found`);
  return { deleted: true, holding_id: args.holding_id };
}

export async function sellLot(
  userId: string,
  supabase: ServiceSupabase,
  args: {
    holding_id: number;
    shares_sold: number;
    sale_price: number;
    sale_date?: string;
    broker?: string;
    notes?: string;
  },
) {
  if (args.shares_sold <= 0) throw new Error("shares_sold must be positive");

  // Ownership-scoped lookup.
  const { data: lot, error: lotErr } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("id", args.holding_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (lotErr) throw new Error(lotErr.message);
  if (!lot) throw new Error(`Holding ${args.holding_id} not found`);
  if (args.shares_sold > Number(lot.shares) + 1e-9) {
    throw new Error(
      `Cannot sell ${args.shares_sold} shares — lot only holds ${lot.shares}`,
    );
  }

  const realized_pnl = (args.sale_price - Number(lot.cost_basis)) * args.shares_sold;

  const { data: sale, error: saleErr } = await supabase
    .from("stock_sales")
    .insert({
      user_id: userId,
      portfolio_id: lot.portfolio_id,
      holding_id: lot.id,
      ticker: lot.ticker,
      shares_sold: args.shares_sold,
      sale_price: args.sale_price,
      cost_basis: lot.cost_basis,
      realized_pnl,
      currency: (lot.currency || "USD").toUpperCase(),
      sale_date: args.sale_date ?? null,
      broker: args.broker ?? lot.broker ?? null,
      notes: args.notes ?? null,
    })
    .select()
    .single();
  if (saleErr) throw new Error(saleErr.message);

  const remaining = Number(lot.shares) - args.shares_sold;
  let lot_remaining: number;
  if (remaining <= 1e-9) {
    const { error: delErr } = await supabase
      .from("portfolio_holdings")
      .delete()
      .eq("id", lot.id)
      .eq("user_id", userId);
    if (delErr) throw new Error(delErr.message);
    lot_remaining = 0;
  } else {
    const { error: updErr } = await supabase
      .from("portfolio_holdings")
      .update({ shares: remaining })
      .eq("id", lot.id)
      .eq("user_id", userId);
    if (updErr) throw new Error(updErr.message);
    lot_remaining = remaining;
  }

  return { sale, lot_remaining };
}

// ── Stock sales ────────────────────────────────────────────

export async function listStockSales(
  userId: string,
  supabase: ServiceSupabase,
  args: { portfolio_id: number; ticker?: string },
) {
  await assertPortfolioOwned(userId, supabase, args.portfolio_id);
  let q = supabase
    .from("stock_sales")
    .select("*")
    .eq("portfolio_id", args.portfolio_id)
    .eq("user_id", userId)
    .order("sale_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (args.ticker) q = q.eq("ticker", tickerOf(args.ticker));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── LLM thoughts (read-only, public-ish) ───────────────────

export async function getLlmThoughts(
  _userId: string,
  supabase: ServiceSupabase,
  args: { ticker: string },
) {
  const { data, error } = await supabase
    .from("llm_analysis")
    .select("*")
    .eq("ticker", tickerOf(args.ticker))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// ── Stock catalog (read current cached price) ──────────────

export async function getStockCatalog(
  _userId: string,
  supabase: ServiceSupabase,
  args: { ticker: string },
) {
  const { data, error } = await supabase
    .from("stock_catalog")
    .select("*")
    .eq("ticker", tickerOf(args.ticker))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
