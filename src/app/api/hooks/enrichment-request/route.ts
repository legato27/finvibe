/**
 * Supabase DB webhook receiver — the push half of the enrichment queue.
 *
 * ── Why a webhook and not the poll ────────────────────────────────────────
 *
 * DGX polled Supabase every 180 s for work. The poll is an OUTBOUND call
 * from the DGX box, and outbound is the direction that has actually failed
 * here: 480 of 480 polls errored with `Errno -3 · Temporary failure in name
 * resolution` on 2026-08-01 and again on 2026-08-07, with two more partial
 * days either side — the host resolved through systemd-resolved whose only
 * upstream was the router, one device, no fallback. Through every one of
 * those days the INBOUND Cloudflare Tunnel stayed healthy and the app kept
 * reaching the API.
 *
 * So the fast path is now a push: Supabase fires this route on INSERT into
 * enrichment_requests, and this route calls DGX through the tunnel the same
 * way every other server-side call does. poll_enrichment_requests still runs
 * on DGX every 10 minutes, because the thing that fails is never the thing
 * you planned for — but it is the backstop now, not the mechanism.
 *
 * ── Setting it up (Supabase dashboard → Database → Webhooks) ──────────────
 *
 *   Name       enrichment-request
 *   Table      public.enrichment_requests
 *   Events     Insert
 *   Type       HTTP Request · POST
 *   URL        https://fin.vibelife.sg/api/hooks/enrichment-request
 *   Headers    x-finvibe-hook-secret: <the value of SUPABASE_WEBHOOK_SECRET>
 *
 * SUPABASE_WEBHOOK_SECRET must be set in the Vercel project env. Without it
 * this route refuses every request rather than defaulting to open — an
 * unauthenticated endpoint that starts GPU work is the hole this whole
 * change is closing, and a config mistake must not reopen it.
 *
 * Note what the webhook does NOT carry: the Cloudflare Access service token
 * for the DGX tunnel. That stays in the Vercel environment, which already
 * holds it, instead of being pasted into a third-party dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceSupabase } from "@/lib/supabase/service";
import { market } from "@/lib/mcp/market";

export const maxDuration = 30;

/**
 * How long to wait on the DGX kick before giving up and releasing the claim.
 *
 * This has to be comfortably inside maxDuration, and the reason is the whole
 * point of the route. If the call hangs — a half-open tunnel, which is the
 * exact failure this queue was built around — the function is killed at 30 s
 * with the catch below never reached, and the request is left at
 * 'processing'. The partial unique index then blocks that ticker for
 * EVERYONE until DGX's 30-minute reaper releases it. Better to abort at 12 s,
 * hand the row back to 'queued', and let the poller retry in ≤10 minutes.
 *
 * The kick only enqueues on DGX; the pipeline itself runs asynchronously
 * there and reports back through finalize_sync_task, so 12 s is generous for
 * what this call actually does.
 */
const ENRICH_TIMEOUT_MS = 12_000;

type HookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: { id?: number; ticker?: string; status?: string } | null;
};

export async function POST(request: NextRequest) {
  const expected = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[hook] SUPABASE_WEBHOOK_SECRET is not set — refusing");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const presented = request.headers.get("x-finvibe-hook-secret") ?? "";
  if (!secretMatches(presented, expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: HookPayload;
  try {
    payload = (await request.json()) as HookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (payload.type !== "INSERT" || payload.table !== "enrichment_requests") {
    // Not ours. 200 so Supabase does not retry something we will never accept.
    return NextResponse.json({ ignored: true });
  }

  const id = payload.record?.id;
  if (typeof id !== "number") {
    return NextResponse.json({ error: "record.id missing" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Re-read rather than trusting the payload. The webhook body is whatever
  // reached this endpoint; the row is what the database actually holds, and
  // the ticker in it has been through the RPC's validation and the table's
  // CHECK constraint.
  const { data: row, error: readErr } = await supabase
    .from("enrichment_requests")
    .select("id, ticker, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[hook] request read failed:", readErr.message);
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ ignored: "no such request" });
  if (row.status !== "queued") {
    return NextResponse.json({ ignored: `status=${row.status}` });
  }

  // Claim it. The `.eq("status", "queued")` is the whole concurrency story:
  // if DGX's poller took this row between the read above and here, its
  // update landed first and ours matches nothing, so only one of us starts
  // the chain.
  const { data: claimed, error: claimErr } = await supabase
    .from("enrichment_requests")
    .update({ status: "processing", picked_up_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  if (claimErr) {
    console.error("[hook] claim failed:", claimErr.message);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }
  if (!claimed?.length) {
    return NextResponse.json({ ignored: "already claimed" });
  }

  // Badge on the shared catalog row follows the request.
  await supabase
    .from("stock_catalog")
    .update({ enrichment_status: "processing" })
    .eq("ticker", row.ticker);

  try {
    await market.enrich(row.ticker, ENRICH_TIMEOUT_MS);
  } catch (err) {
    // Release the claim so poll_enrichment_requests retries in ≤10 minutes.
    // Leaving it at 'processing' would strand the request behind the partial
    // unique index and block the ticker from ever being re-requested.
    //
    // A timeout lands here too, and may mean DGX did receive the kick and is
    // working on it. Releasing anyway is the right trade: /watchlist/enrich
    // is idempotent per ticker, so a duplicate kick from the poller costs
    // nothing, whereas a stranded row costs that ticker half an hour.
    console.error(`[hook] enrich ${row.ticker} failed, releasing claim`, err);
    await supabase
      .from("enrichment_requests")
      .update({ status: "queued", picked_up_at: null })
      .eq("id", id)
      .eq("status", "processing");
    return NextResponse.json(
      { queued: row.ticker, kicked: false, retry: "poller" },
      { status: 202 },
    );
  }

  // finalize_sync_task on DGX closes the row when the chain completes and the
  // projection has landed. Nothing more to do here.
  return NextResponse.json({ ticker: row.ticker, kicked: true });
}

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare lengths first and still run the constant-time compare.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
