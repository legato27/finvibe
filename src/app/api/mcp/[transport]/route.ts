import { createMcpHandler } from "mcp-handler";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateBearer } from "@/lib/mcp/tokens";
import { registerTools } from "@/lib/mcp/tools";
import { originOf } from "@/lib/mcp/oauth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Add CORS headers to any Response. mcp-handler's own responses don't
// include Access-Control-Allow-Origin, so cross-origin browsers (or CORS-
// strict server-side fetchers) treat them as failures even when status=200.
function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  );
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

async function handler(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const headerSummary = authHeader
    ? `${authHeader.slice(0, 18)}…(${authHeader.length}ch)`
    : "(none)";
  console.error(
    `[mcp] ${req.method} ${url.pathname} auth=${headerSummary} ` +
      `origin=${req.headers.get("origin") ?? "?"} ` +
      `referer=${req.headers.get("referer") ?? "?"}`,
  );

  const supabase = createServiceSupabase();
  const auth = await validateBearer(req, supabase);
  if (!auth) {
    console.error(
      `[mcp] validateBearer rejected; returning 401. header_present=${Boolean(authHeader)}`,
    );
    const resourceMetadataUrl = `${originOf(req)}/api/mcp/.well-known/oauth-protected-resource`;
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="vibefin", resource_metadata="${resourceMetadataUrl}"`,
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "WWW-Authenticate",
        },
      },
    );
  }
  console.error(`[mcp] auth ok; userId=${auth.userId} tokenId=${auth.tokenId}`);

  const mcp = createMcpHandler(
    (server) => {
      registerTools(server, { userId: auth.userId, supabase });
    },
    {},
    {
      basePath: "/api/mcp",
      maxDuration: 60,
      verboseLogs: false,
    },
  );
  try {
    const resp = await mcp(req);
    console.error(`[mcp] handler responded status=${resp.status}`);
    return withCors(resp);
  } catch (e) {
    console.error(`[mcp] mcp-handler threw:`, e);
    return withCors(
      new Response(
        JSON.stringify({ error: "Internal", detail: (e as Error)?.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;

// Explicit CORS preflight for cross-origin MCP clients (Claude.ai's
// browser-side validation hits this first). Without these headers the
// preflight fails and Claude treats the connection as broken even though
// /token issued tokens correctly.
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id",
      "Access-Control-Expose-Headers":
        "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    },
  });
}
