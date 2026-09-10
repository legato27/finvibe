// Single enrichment entry-point for the web UI. Both watchlist add and
// portfolio holding add fire here after their insert; the watchlist and
// holdings hooks also poll here with `{ sweep: true }` to auto-requeue
// any rows still stuck in pending. The MCP server uses the same helpers
// from src/lib/mcp/db.ts so behaviour stays consistent across surfaces.
//
// ── What changed, and why the old gate did not work ────────────────────
//
// This route used to answer 403 to anyone who was not a super admin, and
// that read as the control on who could spend GPU and LLM time. It was
// not. The queue was `stock_catalog.enrichment_status = 'pending'`, DGX's
// poller picked up any row in that state from anyone, and
// 002_rls_policies.sql granted `insert to authenticated with check (true)`
// — so a logged-in user with the browser's anon key could enqueue the full
// pipeline without this route being involved at all. The gate guarded the
// front door of a building with no walls.
//
// The queue is now public.enrichment_requests: every row carries
// requested_by, the requester has no UPDATE policy, and the
// file_enrichment_request RPC caps each user's rolling 24 h and in-flight
// counts regardless of which key calls it. Because the cap is in the
// database, it holds on the paths this route does not control — the MCP
// server's service-role client included.
//
// With attribution and a ceiling in place, the blanket 403 is no longer
// what protects the box, and keeping it would mean ordinary users add
// stocks that silently never enrich. So a request from any authenticated
// user is now FILED; what super admins keep is the immediate kick, so
// their requests do not wait on the webhook. To go back to admin-only,
// set daily_cap/concurrent_cap to 0 in supabase/018 — non-admin asks then
// come back as `capped` instead of vanishing.
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  fileEnrichmentRequest,
  kickoffEnrichment,
  sweepUserEnrichment,
  type EnrichmentOutcome,
} from "@/lib/mcp/db";
import { isSuperAdminEmail } from "@/lib/auth/super-admin";
import { pooledMap } from "@/lib/util/pool";

export const maxDuration = 60;

type Body = {
  tickers?: string[];
  sweep?: boolean;
};

export async function POST(request: NextRequest) {
  const cookieClient = await createServerSupabase();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSuperAdmin = isSuperAdminEmail(user.email);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Sweep path — auto-requeue any of this user's stale rows.
  if (body.sweep) {
    const result = await sweepUserEnrichment(user.id, supabase, isSuperAdmin);
    return NextResponse.json(result);
  }

  // Add path — explicit tickers, ownership-verified.
  const requested = (body.tickers ?? [])
    .map((t) => (typeof t === "string" ? t.trim().toUpperCase() : ""))
    .filter(Boolean);
  if (!requested.length) {
    return NextResponse.json(
      { error: "tickers[] or sweep=true is required" },
      { status: 400 },
    );
  }

  const owned = await ownedTickers(user.id, supabase, requested);
  const skipped = requested.filter((t) => !owned.has(t));
  const allowed = requested.filter((t) => owned.has(t));

  // File every allowed ticker. The RPC is idempotent per ticker and capped
  // per user, so this is safe to call on every add and on every retry.
  const filed = await pooledMap(allowed, 5, (t) =>
    fileEnrichmentRequest(supabase, t, user.id, "web"),
  );

  const queued: string[] = [];
  const capped: string[] = [];
  const failed: string[] = [];
  const kickable: string[] = [];
  filed.forEach((r, i) => {
    const t = allowed[i];
    const outcome: EnrichmentOutcome = r?.outcome ?? "error";
    if (outcome === "filed") {
      queued.push(t);
      kickable.push(t);
    } else if (outcome === "already_open") {
      // Someone got there first; the work is coming either way.
      kickable.push(t);
    } else if (outcome === "capped") {
      capped.push(t);
    } else {
      failed.push(t);
    }
  });

  // Super admins get the immediate kick as well, so the admin "add and see
  // it fill in" flow does not wait on a webhook round trip. For everyone
  // else the DB webhook drives it, with poll_enrichment_requests on DGX as
  // the 10-minute backstop. A kick that fails is not a failed request: the
  // row stays 'queued' and the poller will retry it.
  const enriched: string[] = [];
  if (isSuperAdmin && kickable.length) {
    const results = await pooledMap(kickable, 5, (t) =>
      kickoffEnrichment(supabase, t, true),
    );
    results.forEach((r, i) => {
      if (r?.kicked) enriched.push(kickable[i]);
    });
  }

  return NextResponse.json({ enriched, queued, capped, failed, skipped });
}

// Confirm each ticker appears in at least one watchlist or portfolio
// holding owned by this user. Service-role bypasses RLS, so we must
// scope every read by user_id explicitly.
async function ownedTickers(
  userId: string,
  supabase: ReturnType<typeof createServiceSupabase>,
  tickers: string[],
): Promise<Set<string>> {
  const out = new Set<string>();

  const [{ data: wlRows }, { data: hRows }] = await Promise.all([
    supabase
      .from("watchlists")
      .select("watchlist_items(stock_catalog(ticker))")
      .eq("user_id", userId),
    supabase
      .from("portfolio_holdings")
      .select("ticker")
      .eq("user_id", userId)
      .in("ticker", tickers),
  ]);

  for (const w of wlRows ?? []) {
    const items =
      (w as { watchlist_items?: Array<{ stock_catalog?: { ticker?: string } | null }> })
        .watchlist_items ?? [];
    for (const it of items) {
      const t = it?.stock_catalog?.ticker;
      if (t && tickers.includes(t)) out.add(t);
    }
  }
  for (const h of hRows ?? []) {
    const t = (h as { ticker?: string }).ticker;
    if (t) out.add(t);
  }
  return out;
}
