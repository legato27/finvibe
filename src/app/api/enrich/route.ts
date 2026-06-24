// Single enrichment entry-point for the web UI. Both watchlist add and
// portfolio holding add fire here after their insert; the watchlist and
// holdings hooks also poll here with `{ sweep: true }` to auto-requeue
// any rows still stuck in pending. The MCP server uses the same helpers
// from src/lib/mcp/db.ts so behaviour stays consistent across surfaces.
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { kickoffEnrichment, sweepUserEnrichment } from "@/lib/mcp/db";
import { isSuperAdminEmail } from "@/lib/auth/super-admin";

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

  // Stock enrichment runs the expensive DGX pipeline; restrict it to super
  // admins. Non-admins still read whatever the shared catalog already holds —
  // their watchlist/holding adds simply don't trigger a new enrichment.
  if (!isSuperAdminEmail(user.email)) {
    return NextResponse.json(
      { error: "Forbidden: stock enrichment is restricted to administrators." },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Sweep path — auto-requeue any of this user's stale rows.
  if (body.sweep) {
    // Reached only after the super-admin gate above, so enrichment is allowed.
    const result = await sweepUserEnrichment(user.id, supabase, true);
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

  const enriched: string[] = [];
  const failed: string[] = [];
  const results = await Promise.allSettled(
    allowed.map((t) => kickoffEnrichment(supabase, t, true)),
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled") enriched.push(allowed[i]);
    else failed.push(allowed[i]);
  });

  return NextResponse.json({ enriched, failed, skipped });
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
