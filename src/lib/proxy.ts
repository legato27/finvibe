/**
 * Proxy helper — forwards requests to the DGX Spark backend
 * through the Cloudflare Tunnel with Access service token headers.
 */

const DGX_API_URL = process.env.DGX_API_URL!;
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

export async function proxyToDgx(
  path: string,
  request: Request
): Promise<Response> {
  const url = `${DGX_API_URL}${path}`;

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
