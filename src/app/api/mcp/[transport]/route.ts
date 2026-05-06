import { createMcpHandler } from "mcp-handler";
import { createServiceSupabase } from "@/lib/supabase/service";
import { hashToken } from "@/lib/mcp/tokens";
import { registerTools } from "@/lib/mcp/tools";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Validate personal access tokens only
async function validatePersonalToken(
  token: string,
): Promise<{ userId: string } | null> {
  if (!token.startsWith("vbf_")) {
    console.error(`[validateToken] not a personal token`);
    return null;
  }

  const supabase = createServiceSupabase();
  const hash = hashToken(token);
  const { data } = await supabase
    .from("mcp_tokens")
    .select("id, user_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) {
    console.error(`[validateToken] vbf_ token not found / revoked`);
    return null;
  }

  void supabase
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { userId: data.user_id as string };
}

function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

async function handler(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  console.error(`[mcp] ${req.method} ${url.pathname} auth=${authHeader ? "present" : "missing"}`);

  // Extract token (handle both "Bearer token" and raw token formats)
  let token = authHeader ? /^Bearer\s+(\S+)$/.exec(authHeader)?.[1] : undefined;
  if (!token && authHeader?.startsWith("vbf_")) {
    token = authHeader;
  }

  // Validate personal token
  const validation = token ? await validatePersonalToken(token) : null;
  if (!validation) {
    console.error(`[mcp] token validation failed, returning 401`);
    return withCors(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  const { userId } = validation;
  console.error(`[mcp] token valid: userId=${userId}`);

  // Create MCP handler with verified user
  const supabase = createServiceSupabase();
  const mcp = createMcpHandler(
    (server) => {
      registerTools(server, { userId, supabase });
    },
    {},
    { basePath: "/api/mcp", maxDuration: 60, verboseLogs: false },
  );

  try {
    const resp = await mcp(req);
    console.error(`[mcp] handler responded status=${resp.status}`);
    return withCors(resp);
  } catch (e) {
    console.error(`[mcp] handler threw:`, e);
    return withCors(
      new Response(JSON.stringify({ error: "Internal", detail: (e as Error)?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
