/**
 * Proxy helper — forwards requests to the DGX Spark backend
 * through the Cloudflare Tunnel with Access service token headers.
 *
 * It is also where the app's outage behaviour lives, in three tiers:
 *
 *   1. the Vercel edge holds a shared copy of anything on the allowlist,
 *      under a Cache-Control this function sets itself;
 *   2. every successful response on that allowlist is written through to
 *      Supabase as it passes;
 *   3. when the box cannot answer, the staged copy is served instead,
 *      marked with `X-FinVibe-Stale`.
 *
 * Without the third part the staging tier is a set of tables nothing reads:
 * the outage on 2026-08-25 took every per-ticker endpoint with it precisely
 * because this function returned the upstream status untouched. Without the
 * second, the tier only ever covers what someone remembered to mirror from
 * the other side — which on 2026-09-02 turned out to exclude the stock
 * page's own gating request, the whole dashboard, FX, and the batch columns
 * on the watchlist.
 */

import { after } from "next/server";
import {
  hasStagedBatchFallback,
  hasStagedFallback,
  readStaged,
  readStagedBatch,
  type StagedHit,
} from "@/lib/staging";
import { capturePathResponse, captureBatchResponse } from "@/lib/stagingCapture";
import { matchPathFamily, stagedTimeoutMs } from "@/lib/stagingPaths";

const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

// How long to wait on the tunnel is now per family — see stagedTimeoutMs and
// PathFamily.timeoutMs in src/lib/stagingPaths.ts. Unstaged paths keep the
// old unbounded behaviour on purpose: cutting them short would break working
// requests to no benefit, since there is nothing to fall back to.

// Normalize DGX_API_URL: tolerate a schemeless value ("api.vibelife.sg") by
// assuming https, and strip any trailing slash so `${base}${path}` is clean.
// Returns "" if unset so callers can fail with a clear message instead of
// fetch("undefined/...") throwing an opaque "Failed to parse URL" → 502.
function resolveDgxBase(): string {
  const raw = (process.env.DGX_API_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

export async function proxyToDgx(
  path: string,
  request: Request
): Promise<Response> {
  const method = request.method;
  const isRead = method === "GET" || method === "HEAD";
  // Only reads can be answered from a snapshot. A POST is a request to change
  // something on DGX; there is no honest stale version of that — with three
  // named exceptions, the batch reads whose argument is too long for a query
  // string. See hasStagedBatchFallback.
  const batchKind = method === "POST" ? hasStagedBatchFallback(path) : null;
  const canFallBack = (isRead && hasStagedFallback(path)) || batchKind !== null;

  // Forward body for non-GET requests. Kept in a variable because the batch
  // fallback needs to read the ticker list out of it after the call failed,
  // and the request stream can only be consumed once.
  const requestBody =
    method !== "GET" && method !== "HEAD" ? await request.text() : "";

  const fallback = async (): Promise<StagedHit | null> => {
    if (batchKind) return readStagedBatch(batchKind, requestBody);
    return canFallBack ? readStaged(path) : null;
  };

  const base = resolveDgxBase();
  if (!base) {
    // Misconfiguration, not an outage — but the user-visible symptom is
    // identical, so a staged copy is still the better answer.
    const staged = await fallback();
    if (staged) return stagedResponse(staged);
    return new Response(
      JSON.stringify({ error: "DGX_API_URL is not configured on the server" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
  const url = `${base}${path}`;

  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");

  // Cloudflare Access service token for machine-to-machine auth
  if (CF_ACCESS_CLIENT_ID) {
    headers.set("CF-Access-Client-Id", CF_ACCESS_CLIENT_ID);
  }
  if (CF_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Secret", CF_ACCESS_CLIENT_SECRET);
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = requestBody;
  }

  if (canFallBack) {
    init.signal = AbortSignal.timeout(stagedTimeoutMs(path));
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    // Tunnel down, DNS gone, connection refused, or our own timeout above.
    const staged = await fallback();
    if (staged) {
      console.warn(`[proxy] ${path} unreachable — serving staged copy from ${staged.asOf}`);
      return stagedResponse(staged);
    }
    throw err;
  }

  // 5xx only. A 404 is DGX answering — "no verdict computable for this name" —
  // and papering over it with a snapshot would resurrect data the backend has
  // deliberately stopped serving, which is how a delisted or suspended symbol
  // keeps showing a trade setup. A 4xx is likewise a real answer about the
  // request, not a failure of the box.
  if (response.status >= 500 && canFallBack) {
    const staged = await fallback();
    if (staged) {
      console.warn(
        `[proxy] ${path} returned ${response.status} — serving staged copy from ${staged.asOf}`
      );
      return stagedResponse(staged);
    }
  }

  return liveResponse(path, method, response, batchKind);
}

/**
 * A live answer, on its way through — captured for the next outage and, if
 * it is shared data, marked cacheable for the edge.
 *
 * Capture needs the body, so for anything on the allowlist the response is
 * buffered rather than streamed. That is the whole cost of the tier on the
 * happy path: one extra copy of a JSON payload in memory, for responses
 * already small enough to be worth storing (MAX_BODY_BYTES). Everything
 * else keeps streaming exactly as before.
 */
async function liveResponse(
  path: string,
  method: string,
  response: Response,
  batchKind: ReturnType<typeof hasStagedBatchFallback>,
): Promise<Response> {
  const family = method === "GET" ? matchPathFamily(path) : null;
  const capturable =
    response.status === 200 &&
    (response.headers.get("Content-Type") || "").includes("json") &&
    (family !== null || (batchKind !== null && batchKind !== "prices"));

  if (!capturable) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Cache-Control": response.headers.get("Cache-Control") || "no-cache",
      },
    });
  }

  const raw = await response.text();

  // `after` runs once the response has been flushed, so the capture never
  // sits between DGX and the browser. A capture that failed or timed out
  // would otherwise turn a served request into a failed one — the exact
  // inversion of what this tier is for.
  after(async () => {
    try {
      if (family) await capturePathResponse(path, raw);
      else if (batchKind && batchKind !== "prices") await captureBatchResponse(batchKind, raw);
    } catch (err) {
      console.warn(`[proxy] capture failed for ${path}:`, err);
    }
  });

  return new Response(raw, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Cache-Control": edgeCacheControl(family, response),
    },
  });
}

/**
 * What the edge may hold.
 *
 * Previously this was whatever DGX said, forwarded verbatim — which meant
 * the instruction to keep a copy for a day arrived only while the box was
 * alive to send it. For allowlisted, shared, public paths the directive is
 * now ours, and `stale-while-revalidate` is the half that matters in an
 * outage: past s-maxage the edge serves its copy and revalidates behind the
 * request, and a revalidation against a dead origin leaves that copy in
 * place rather than evicting it.
 *
 * Anything not on the allowlist keeps the old behaviour, including every
 * user-scoped route — those must never be marked `public`, and the
 * allowlist is what guarantees they are not.
 */
function edgeCacheControl(
  family: ReturnType<typeof matchPathFamily>,
  response: Response,
): string {
  if (!family) return response.headers.get("Cache-Control") || "no-cache";
  return `public, s-maxage=${family.sMaxAge}, stale-while-revalidate=86400, stale-if-error=86400`;
}

function stagedResponse(staged: StagedHit): Response {
  return new Response(JSON.stringify(staged.body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // The age of the DATA, not of the copy. Everything downstream — the
      // banner, the axios interceptor, anyone reading the logs — measures
      // against this.
      "X-FinVibe-Stale": staged.asOf,
      "X-FinVibe-Stale-Source": "supabase-snapshot",
      "X-FinVibe-Stale-Family": staged.label,
      // Never cache a fallback. The edge cache is the fourth store that has
      // to agree with the other three, and an s-maxage on a stale body would
      // keep serving it for minutes after the box came back — turning a
      // recovered outage into a lingering one, at the CDN, where nothing on
      // the box can reach in to fix it.
      "Cache-Control": "no-store",
    },
  });
}
