import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateBearer, hashToken } from "@/lib/mcp/tokens";
import { lookupOAuthToken } from "@/lib/mcp/oauth";
import { registerTools } from "@/lib/mcp/tools";
import { originOf } from "@/lib/mcp/oauth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Resource identifier for RFC 8707 binding. Tokens are bound to this URL
// when issued from /token; mcp-handler's withMcpAuth checks the binding
// matches the MCP server URL on every request.
function resourceUrl(req: Request): string {
  return `${originOf(req)}/api/mcp/mcp`;
}

// Build the AuthInfo from either a vbo_ (OAuth) or vbf_ (personal) token.
// withMcpAuth calls this on every request; returning undefined → 401.
async function verifyToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) {
    console.error(`[verifyToken] no bearer token`);
    return undefined;
  }
  console.error(
    `[verifyToken] secret_prefix=${bearerToken.slice(0, 12)} secret_len=${bearerToken.length}`,
  );

  const supabase = createServiceSupabase();
  const expectedResource = resourceUrl(req);

  // OAuth access token (vbo_…)
  if (bearerToken.startsWith("vbo_")) {
    const result = await lookupOAuthToken(supabase, bearerToken);
    if (!result) {
      console.error(`[verifyToken] vbo_ token not found / expired / revoked`);
      return undefined;
    }
    // Read the full row to get scope / expiry / resource for AuthInfo.
    const { data } = await supabase
      .from("mcp_oauth_tokens")
      .select("scope, access_expires_at, resource")
      .eq("id", result.tokenId)
      .maybeSingle();
    // Validate resource binding per RFC 8707: token must be used with the resource it was issued for.
    const storedResource = (data?.resource as string | null) ?? expectedResource;
    if (storedResource && storedResource !== expectedResource) {
      console.error(
        `[verifyToken] resource mismatch: token=${storedResource} request=${expectedResource}`,
      );
      return undefined;
    }
    return {
      token: bearerToken,
      clientId: result.clientId,
      scopes: ((data?.scope as string | undefined) ?? "mcp.full").split(/\s+/).filter(Boolean),
      expiresAt: data?.access_expires_at
        ? Math.floor(new Date(data.access_expires_at as string).getTime() / 1000)
        : undefined,
      resource: new URL(expectedResource),
      extra: { userId: result.userId, kind: "oauth" },
    };
  }

  // Personal access token (vbf_…) — also build an AuthInfo so withMcpAuth
  // accepts it. We re-validate via the same path as before.
  if (bearerToken.startsWith("vbf_")) {
    const hash = hashToken(bearerToken);
    const { data } = await supabase
      .from("mcp_tokens")
      .select("id, user_id")
      .eq("token_hash", hash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!data) {
      console.error(`[verifyToken] vbf_ token not found / revoked`);
      return undefined;
    }
    void supabase
      .from("mcp_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});
    return {
      token: bearerToken,
      clientId: "personal",
      scopes: ["mcp.full"],
      resource: new URL(expectedResource),
      extra: { userId: data.user_id as string, kind: "personal" },
    };
  }

  console.error(`[verifyToken] unrecognized token prefix`);
  return undefined;
}

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
      `origin=${req.headers.get("origin") ?? "?"}`,
  );

  // Extract and verify token BEFORE wrapping, since withMcpAuth may not preserve headers
  // Handle both "Bearer token" format and raw token (some clients send token directly)
  let bearerMatch = authHeader ? /^Bearer\s+(\S+)$/.exec(authHeader)?.[1] : undefined;
  if (!bearerMatch && authHeader && /^(vbf_|vbo_)/.test(authHeader)) {
    bearerMatch = authHeader; // Token sent directly without Bearer prefix
  }
  console.error(`[mcp] extracted bearer_prefix=${bearerMatch?.slice(0, 12) ?? "none"} authHeader_prefix=${authHeader?.slice(0, 12) ?? "none"}`);

  const supabase = createServiceSupabase();
  const auth = bearerMatch ? await verifyToken(req, bearerMatch) : undefined;
  if (!auth) {
    console.error(`[mcp] pre-wrap verify failed, returning 401`);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = (auth.extra?.userId as string | undefined) ?? "";
  console.error(`[mcp] pre-wrap verify OK: userId=${userId}`);

  // Build the underlying mcp-handler. registerTools needs a userId — we
  // attach the verified AuthInfo to req in withMcpAuth, so we read it back
  // here from the standard `req.auth` extension that mcp-handler sets.
  const mcp = createMcpHandler(
    (server) => {
      // Tools are registered per-request; the closure reads auth.extra.userId
      // off the wrapped request below at handler call time. We re-create the
      // handler per-request so each call gets the right userId.
      void server;
    },
    {},
    {
      basePath: "/api/mcp",
      maxDuration: 60,
      verboseLogs: false,
    },
  );

  // The right structure: build a per-request handler that registers tools
  // bound to the verified user, then have withMcpAuth gate on Bearer.
  const perRequestHandler = async (innerReq: Request): Promise<Response> => {
    // Token already verified above, just use the userId
    console.error(`[mcp] inner handler: userId=${userId}`);

    const innerMcp = createMcpHandler(
      (server) => {
        registerTools(server, { userId, supabase });
      },
      {},
      { basePath: "/api/mcp", maxDuration: 60, verboseLogs: false },
    );
    try {
      const resp = await innerMcp(innerReq);
      console.error(`[mcp] inner handler responded status=${resp.status}`);
      return resp;
    } catch (e) {
      console.error(`[mcp] mcp-handler threw:`, e);
      return new Response(
        JSON.stringify({ error: "Internal", detail: (e as Error)?.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  };

  // Wrap with withMcpAuth — handles WWW-Authenticate header, resource
  // metadata pointer, scope checks, and 401 responses per MCP spec.
  // Pass a dummy verifyToken that returns the pre-verified auth, since we already
  // verified the token before wrapping (headers don't persist through withMcpAuth).
  const dummyVerify = async (_req: Request, _bearerToken?: string): Promise<AuthInfo | undefined> => {
    console.error(`[mcp] dummyVerify called, returning pre-verified auth`);
    return auth;
  };
  const wrapped = withMcpAuth(perRequestHandler, dummyVerify, {
    required: true,
    resourceMetadataPath: "/api/mcp/.well-known/oauth-protected-resource",
    resourceUrl: originOf(req),
  });

  // Silence unused warning while keeping the original handler available for
  // diagnostics (we may reintroduce direct mcp() if withMcpAuth misbehaves).
  void mcp;

  try {
    const resp = await wrapped(req);
    console.error(`[mcp] wrapped handler responded status=${resp.status}`);
    return withCors(resp);
  } catch (e) {
    console.error(`[mcp] wrapped handler threw:`, e);
    return withCors(
      new Response(
        JSON.stringify({ error: "Internal", detail: (e as Error)?.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
}

// Keep validateBearer importable but no longer used by this route.
void validateBearer;

export const GET = handler;
export const POST = handler;
export const DELETE = handler;

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
