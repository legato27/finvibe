/**
 * How much of the app would still answer if DGX went dark right now.
 *
 * The staging tier's failure mode is silence: it either has a copy or it
 * does not, and you find out during the outage. The pushed families are
 * reported by scripts/health_check.sh — which runs ON DGX, so it is exactly
 * as available as the thing it is reassuring you about. The captured
 * families had nothing at all.
 *
 * This is that answer, computed from Supabase alone, so it keeps working in
 * the situation it describes. Deliberately NOT proxied to DGX and
 * deliberately a local route — it sits above src/app/api/[...path]/route.ts
 * in Next's matching order, so it never reaches the tunnel.
 *
 * ── What it does not return ───────────────────────────────────────────
 *
 * No bodies and no keys. Counts and timestamps only. dgx_response_snapshot
 * has no read policy for a reason (see 019); this route reads it with the
 * service key, and the least it can do is not hand back the contents of a
 * table the database refuses to show anyone.
 */

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { BATCH_FAMILIES, PATH_FAMILIES } from "@/lib/stagingPaths";
import { FAMILIES } from "@/lib/staging";

export const dynamic = "force-dynamic";

type Row = {
  key: string;
  label: string;
  /** "pushed" by DGX, or "captured" by the proxy on the way past. */
  kind: "pushed" | "captured";
  rows: number;
  /** Rows still inside their serving window — the ones that would answer. */
  fresh: number;
  newest: string | null;
  oldest: string | null;
  /** Serving window, in days, for the banner and the tooltip. */
  windowDays: number;
};

export async function GET() {
  // Any signed-in user. The numbers are about the deployment, not about a
  // person, and the whole point is to be readable during an incident.
  const cookieClient = await createServerSupabase();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let supabase: ReturnType<typeof createServiceSupabase>;
  try {
    supabase = createServiceSupabase();
  } catch (err) {
    // The tier is off, not broken. Say which, because "0 rows everywhere"
    // and "no service key configured" look identical on screen and have
    // completely different fixes.
    return NextResponse.json(
      { error: `Staging is disabled: ${(err as Error).message}`, families: [] },
      { status: 200 },
    );
  }

  const DAY = 24 * 60 * 60 * 1000;
  const rows: Row[] = [];

  async function tally(
    table: string,
    column: string,
    key: string,
    label: string,
    kind: Row["kind"],
    maxAge: number,
    familyFilter?: string,
  ): Promise<void> {
    const cutoff = new Date(Date.now() - maxAge).toISOString();
    const base = () => {
      const q = supabase.from(table).select(column, { count: "exact", head: true });
      return familyFilter ? q.eq("family", familyFilter) : q;
    };

    const [total, fresh, newest, oldest] = await Promise.all([
      base(),
      base().gte("as_of", cutoff),
      (familyFilter
        ? supabase.from(table).select("as_of").eq("family", familyFilter)
        : supabase.from(table).select("as_of")
      )
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle(),
      (familyFilter
        ? supabase.from(table).select("as_of").eq("family", familyFilter)
        : supabase.from(table).select("as_of")
      )
        .order("as_of", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    rows.push({
      key,
      label,
      kind,
      rows: total.count ?? 0,
      fresh: fresh.count ?? 0,
      newest: (newest.data as { as_of?: string } | null)?.as_of ?? null,
      oldest: (oldest.data as { as_of?: string } | null)?.as_of ?? null,
      windowDays: Math.round(maxAge / DAY),
    });
  }

  try {
    // The four DGX-pushed families from 017.
    for (const [key, f] of Object.entries(FAMILIES)) {
      await tally(f.table, f.column, key, f.label, "pushed", f.maxAge);
    }

    // Everything the proxy captures, split the way 019 stores it: whole
    // responses under 'path', and the per-ticker batch families.
    await tally(
      "dgx_response_snapshot",
      "key",
      "path",
      "captured responses",
      "captured",
      // No single window — each path family has its own. Report against the
      // longest so "fresh" means "something here could still be served",
      // and leave the per-family judgement to the read path.
      Math.max(...PATH_FAMILIES.map((f) => f.maxAge)),
      "path",
    );
    for (const spec of Object.values(BATCH_FAMILIES)) {
      if (!spec.refreshAfter) continue; // prices come from stock_catalog
      await tally(
        "dgx_response_snapshot",
        "key",
        spec.family,
        spec.label,
        "captured",
        spec.maxAge,
        spec.family,
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read staging coverage: ${(err as Error).message}`, families: rows },
      { status: 200 },
    );
  }

  // Prices are not a table — they ride on the catalog mirror DGX already
  // keeps current. Counted separately so the page does not imply the
  // watchlist's price column has nothing behind it.
  const priceCutoff = new Date(Date.now() - BATCH_FAMILIES.prices.maxAge).toISOString();
  const [catalogTotal, catalogFresh] = await Promise.all([
    supabase.from("stock_catalog").select("ticker", { count: "exact", head: true }),
    supabase
      .from("stock_catalog")
      .select("ticker", { count: "exact", head: true })
      .gte("last_price_updated_at", priceCutoff),
  ]);

  return NextResponse.json({
    families: rows,
    catalog: {
      rows: catalogTotal.count ?? 0,
      fresh: catalogFresh.count ?? 0,
      windowDays: Math.round(BATCH_FAMILIES.prices.maxAge / (24 * 60 * 60 * 1000)),
    },
    checked_at: new Date().toISOString(),
  });
}
