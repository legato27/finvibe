/**
 * Proxy helper — forwards requests to the DGX Spark backend
 * through the Cloudflare Tunnel with Access service token headers.
 */

const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

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
  const base = resolveDgxBase();
  if (!base) {
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
    method: request.method,
    headers,
  };

  // Forward body for non-GET requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const response = await fetch(url, init);

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
