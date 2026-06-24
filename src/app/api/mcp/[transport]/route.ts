import { createMcpHandler } from "mcp-handler";
import { createServiceSupabase } from "@/lib/supabase/service";
import { hashToken } from "@/lib/mcp/tokens";
import { lookupOAuthToken, originOf } from "@/lib/mcp/oauth";
import { registerTools } from "@/lib/mcp/tools";
import { toMcpScope, type McpScope } from "@/lib/mcp/catalog";
import { isSuperAdminUserId } from "@/lib/auth/super-admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Validate a bearer token — either a vbf_ personal access token or a vbo_
// OAuth 2.1 access token — and resolve its MCP scope.
async function validateToken(
  token: string,
): Promise<{ userId: string; scope: McpScope } | null> {
  if (token.startsWith("vbo_")) {
    const oauth = await lookupOAuthToken(createServiceSupabase(), token);
    if (!oauth) return null;
    return { userId: oauth.userId, scope: toMcpScope(oauth.scope) };
  }
  return validatePersonalToken(token);
}

// Validate personal access tokens only
async function validatePersonalToken(
  token: string,
): Promise<{ userId: string; scope: McpScope } | null> {
  if (!token.startsWith("vbf_")) {
    console.error(`[validateToken] not a personal token`);
    return null;
  }

  const supabase = createServiceSupabase();
  const hash = hashToken(token);

  // Resilient to the scope migration not yet being applied: try selecting the
  // scope column, and if it doesn't exist yet, fall back to the legacy columns
  // and treat the token as full-scope. This means auth NEVER breaks regardless
  // of deploy order — enforcement simply activates once the column exists.
  type TokenRow = { id: number; user_id: string; scope?: string };
  let row: TokenRow | null = null;
  const withScope = await supabase
    .from("mcp_tokens")
    .select("id, user_id, scope")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (withScope.error) {
    const legacy = await supabase
      .from("mcp_tokens")
      .select("id, user_id")
      .eq("token_hash", hash)
      .is("revoked_at", null)
      .maybeSingle();
    row = legacy.data as TokenRow | null;
  } else {
    row = withScope.data as TokenRow | null;
  }

  if (!row) {
    console.error(`[validateToken] vbf_ token not found / revoked`);
    return null;
  }

  void supabase
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => {});

  // Older tokens (pre-scope migration) have no scope value → treat as full.
  const scope = (row.scope as McpScope) ?? "full";
  return { userId: row.user_id as string, scope };
}

function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Let browser clients (claude.ai) read the auth challenge to start OAuth.
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
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

  // Reachability/health probe. Clients (claude.ai's connector among them) issue
  // a HEAD against the endpoint to check liveness. mcp-handler does NOT implement
  // HEAD — it holds the request open until the gateway kills it with a 504, and
  // a single 504 flips a working connector into a permanent "couldn't connect"
  // state in the claude.ai UI. Answer HEAD immediately, before mcp-handler.
  if (req.method === "HEAD") {
    return withCors(new Response(null, { status: 200 }));
  }

  // Extract token (handle both "Bearer token" and raw token formats)
  let token = authHeader ? /^Bearer\s+(\S+)$/.exec(authHeader)?.[1] : undefined;
  if (!token && (authHeader?.startsWith("vbf_") || authHeader?.startsWith("vbo_"))) {
    token = authHeader;
  }

  // Validate a vbf_ personal token or a vbo_ OAuth access token.
  const validation = token ? await validateToken(token) : null;
  if (!validation) {
    console.error(`[mcp] token validation failed, returning 401`);
    // RFC 9728 / MCP auth: point unauthenticated clients at the protected-
    // resource metadata so they can discover the authorization server and
    // start the OAuth flow (this is what makes the claude.ai "Connect" button
    // work — without it the client has no way to find /authorize).
    const resourceMetadata = `${originOf(req)}/.well-known/oauth-protected-resource`;
    return withCors(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
        },
      }),
    );
  }

  const { userId, scope } = validation;
  console.error(`[mcp] token valid: userId=${userId} scope=${scope}`);

  // Create MCP handler with verified user
  const supabase = createServiceSupabase();
  // enrich_stock is super-admin only; resolve once so it's gated at tool
  // registration (a non-admin token never sees the tool).
  const isSuperAdmin = await isSuperAdminUserId(userId, supabase);
  const mcp = createMcpHandler(
    (server) => {
      registerTools(server, { userId, supabase, scope, isSuperAdmin });
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
export const HEAD = handler;

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
