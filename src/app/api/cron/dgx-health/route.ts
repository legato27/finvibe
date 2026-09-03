/**
 * The heartbeat — the half of outage detection that does not need anyone to
 * be looking.
 *
 * The proxy alerts the instant a real request falls back, which is fast,
 * free and driven by actual impact. Its blind spot is the quiet hours: an
 * outage that starts at 3am with nobody using the app produces no requests,
 * therefore no evidence, therefore no alert until someone opens a page over
 * breakfast. That is most of the way back to how the 2026-08-25 outage was
 * found.
 *
 * ── What it probes, and why that endpoint ─────────────────────────────
 *
 * `/api/jobs/status` — the ONE endpoint deliberately excluded from both the
 * staging tier and the edge cache (see NEVER_STAGE). Everything else can
 * answer from a stored copy or a CDN entry, which is exactly the behaviour
 * that would let a probe report health while the box is cold. A heartbeat
 * has to be able to fail.
 *
 * It also goes straight to DGX rather than through proxyToDgx, for the same
 * reason: the fallback exists to hide an outage from users, and this is not
 * a user.
 *
 * ── Nothing schedules this yet ────────────────────────────────────────
 *
 * A `vercel.json` crons entry on a five-minute schedule was the obvious home
 * for it, and Vercel refused the deploy: sub-daily cron schedules are a
 * paid-plan feature, and a once-a-day heartbeat is not a heartbeat. The
 * route is therefore callable but unscheduled — anything that can make an
 * HTTPS request on a timer will drive it:
 *
 *   * Vercel Cron, if the project moves to Pro (add vercel.json back);
 *   * any free uptime monitor pointed at this URL, which doubles as a
 *     check that Vercel itself is up — something a Vercel cron cannot tell
 *     you;
 *   * Supabase pg_cron + pg_net, which is off-box and already available on
 *     the project (both extensions present, neither installed).
 *
 * Until one of those is wired, the traffic-driven half in src/lib/proxy.ts
 * still covers every outage that actually affects someone using the app.
 * What is missing is the 3am outage nobody is awake for.
 */

import { NextRequest, NextResponse } from "next/server";
import { alertDgxDown, alertDgxRecovered, sendTestAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROBE_PATH = "/api/jobs/status";
const PROBE_TIMEOUT_MS = 20_000;

function dgxBase(): string {
  const raw = (process.env.DGX_API_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable
 * is set. Without the variable the route is open — which is survivable but
 * not free: anyone could then make the app claim the backend is down.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `?test=1` sends a message through the configured channels without
  // touching the incident table. Otherwise the first real test of the
  // alerting path is the outage itself, which is the one moment you cannot
  // afford to discover a typo in a webhook URL.
  //
  // Gated on CRON_SECRET specifically — not merely on `authorized()`, which
  // returns true when no secret is set. An open endpoint that sends a push
  // notification on demand is a nuisance vector.
  if (request.nextUrl.searchParams.get("test")) {
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Set CRON_SECRET and pass it as a bearer token to send a test alert." },
        { status: 403 },
      );
    }
    const delivered = await sendTestAlert();
    return NextResponse.json({
      test: true,
      delivered,
      hint: delivered
        ? "Check the channel you configured."
        : "Nothing delivered — set ALERT_WEBHOOK_URL or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, and see the function logs.",
    });
  }

  const base = dgxBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "DGX_API_URL is not configured" },
      { status: 200 },
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CF_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
  }
  if (process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  const started = Date.now();
  let ok = false;
  let detail = "";

  try {
    const res = await fetch(`${base}${PROBE_PATH}`, {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    // A 4xx means the box is alive and objecting to the request, which is
    // not an outage. Only "cannot answer at all" counts.
    ok = res.status < 500;
    if (!ok) detail = `upstream ${res.status}`;
  } catch (err) {
    detail = (err as Error)?.message ?? "probe failed";
  }

  const ms = Date.now() - started;

  // Both directions are reported from here. The proxy can only open an
  // incident when someone is using the app and can only close one from an
  // instance that happened to see the failure; the heartbeat has neither
  // limitation, so it is the reliable half of both transitions.
  const alerted = ok
    ? await alertDgxRecovered()
    : await alertDgxDown(detail, PROBE_PATH, "heartbeat");

  console.log(
    `[cron/dgx-health] ${ok ? "up" : "DOWN"} in ${ms}ms` +
      `${detail ? ` (${detail})` : ""}${alerted ? " — alert sent" : ""}`,
  );

  return NextResponse.json({
    ok,
    probe: PROBE_PATH,
    latency_ms: ms,
    detail: detail || undefined,
    alerted,
    checked_at: new Date().toISOString(),
  });
}
