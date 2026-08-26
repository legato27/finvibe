/**
 * Proxy helper — forwards requests to the DGX Spark backend
 * through the Cloudflare Tunnel with Access service token headers.
 *
 * When the backend cannot answer and a staged copy of the response exists in
 * Supabase, it serves that instead, marked with `X-FinVibe-Stale`. Without
 * that last part the staging tier is a set of tables nothing reads: the
 * outage on 2026-08-25 took every per-ticker endpoint with it precisely
 * because this function returned the upstream status untouched.
 */

import { hasStagedFallback, readStaged, type StagedHit } from "@/lib/staging";

const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

/**
 * How long to wait on the tunnel before deciding the box is not going to
 * answer — applied ONLY to paths that have a staged fallback. A dead origin
 * behind Cloudflare usually 502s promptly, but a half-open connection can
 * hang until the function's own maxDuration (60s), and a fallback that only
 * fires after a minute of spinner is not a fallback anyone experiences.
 *
 * Unstaged paths keep the old unbounded behaviour on purpose: some of them
 * (macro/dashboard, generate-thoughts) legitimately take tens of seconds, and
 * cutting those short would break working requests to no benefit — there is
 * nothing to fall back to.
 */
const STAGED_TIMEOUT_MS = 20_000;

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
  // Only reads can be answered from a snapshot. A POST is a request to change
  // something on DGX; there is no honest stale version of that.
  const canFallBack =
    (method === "GET" || method === "HEAD") && hasStagedFallback(path);

  const base = resolveDgxBase();
  if (!base) {
    // Misconfiguration, not an outage — but the user-visible symptom is
    // identical, so a staged copy is still the better answer.
    const staged = canFallBack ? await readStaged(path) : null;
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

  // Forward body for non-GET requests
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text();
  }

  if (canFallBack) {
    init.signal = AbortSignal.timeout(STAGED_TIMEOUT_MS);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    // Tunnel down, DNS gone, connection refused, or our own timeout above.
    const staged = canFallBack ? await readStaged(path) : null;
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
    const staged = await readStaged(path);
    if (staged) {
      console.warn(
        `[proxy] ${path} returned ${response.status} — serving staged copy from ${staged.asOf}`
      );
      return stagedResponse(staged);
    }
  }

  // Stream the response back
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Cache-Control": response.headers.get("Cache-Control") || "no-cache",
    },
  });
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
