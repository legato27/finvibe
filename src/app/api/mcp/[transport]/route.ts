import { createMcpHandler } from "mcp-handler";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateBearer } from "@/lib/mcp/tokens";
import { registerTools } from "@/lib/mcp/tools";
import { originOf } from "@/lib/mcp/oauth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const headerSummary = authHeader
    ? `${authHeader.slice(0, 12)}…(${authHeader.length}ch)`
    : "(none)";
  console.error(
    `[mcp] ${req.method} ${url.pathname} auth=${headerSummary}`,
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
          // RFC 9728: clients use this to discover the auth server.
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
    return resp;
  } catch (e) {
    console.error(`[mcp] mcp-handler threw:`, e);
    return new Response(
      JSON.stringify({ error: "Internal", detail: (e as Error)?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
