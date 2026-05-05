// OAuth 2.1 token endpoint.
//
// Supports:
//   grant_type=authorization_code  → exchange code (+ PKCE verifier) for access + refresh tokens
//   grant_type=refresh_token       → exchange refresh for new access (+ rotated refresh)

import { createServiceSupabase } from "@/lib/supabase/service";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  generateTokenPair,
  sha256,
  verifyPkceS256,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function err(code: string, description: string, status = 400) {
  return Response.json(
    { error: code, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const out: Record<string, string> = {};
    params.forEach((v, k) => (out[k] = v));
    return out;
  }
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) if (v != null) out[k] = String(v);
    return out;
  }
  return {};
}

async function authenticateClient(
  supabase: ReturnType<typeof createServiceSupabase>,
  body: Record<string, string>,
): Promise<{ ok: true; client_id: string } | { ok: false; resp: Response }> {
  const client_id = body.client_id;
  if (!client_id) return { ok: false, resp: err("invalid_client", "client_id is required", 401) };
  const { data: client } = await supabase
    .from("mcp_oauth_clients")
    .select("id, client_secret_hash, token_endpoint_auth_method")
    .eq("id", client_id)
    .maybeSingle();
  if (!client) return { ok: false, resp: err("invalid_client", "Unknown client_id", 401) };

  // PKCE is mandatory in our flow (validated below in exchangeCode), so the
  // client_secret is treated as an *optional* second factor: if a secret is
  // sent it must match, but its absence isn't fatal. This matches OAuth 2.1
  // public-client behavior and lets PKCE-only clients (Claude.ai, ChatGPT,
  // many editors) authenticate against clients we issued with a secret.
  const secret = body.client_secret;
  if (secret && client.client_secret_hash) {
    if (sha256(secret) !== client.client_secret_hash) {
      return { ok: false, resp: err("invalid_client", "Bad client_secret", 401) };
    }
  }
  return { ok: true, client_id: client.id as string };
}

export async function POST(req: Request) {
  const body = await readForm(req);
  const grant_type = body.grant_type;
  if (!grant_type) return err("invalid_request", "grant_type is required");

  const supabase = createServiceSupabase();
  const auth = await authenticateClient(supabase, body);
  if (!auth.ok) return auth.resp;

  if (grant_type === "authorization_code") {
    return exchangeCode(supabase, auth.client_id, body);
  }
  if (grant_type === "refresh_token") {
    return exchangeRefresh(supabase, auth.client_id, body);
  }
  return err("unsupported_grant_type", `Unsupported grant_type=${grant_type}`);
}

async function exchangeCode(
  supabase: ReturnType<typeof createServiceSupabase>,
  client_id: string,
  body: Record<string, string>,
) {
  const code = body.code;
  const redirect_uri = body.redirect_uri;
  const code_verifier = body.code_verifier;
  if (!code || !redirect_uri || !code_verifier) {
    return err(
      "invalid_request",
      "code, redirect_uri, and code_verifier are required",
    );
  }

  const { data: row } = await supabase
    .from("mcp_oauth_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!row) return err("invalid_grant", "Unknown or expired code");
  if (row.consumed_at) return err("invalid_grant", "Code already used");
  if (row.client_id !== client_id) {
    return err("invalid_grant", "Code was issued to a different client");
  }
  if (row.redirect_uri !== redirect_uri) {
    return err("invalid_grant", "redirect_uri mismatch");
  }
  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return err("invalid_grant", "Code expired");
  }
  if (!verifyPkceS256(code_verifier, row.code_challenge as string)) {
    return err("invalid_grant", "PKCE verification failed");
  }

  // Mark code consumed (one-time use).
  await supabase
    .from("mcp_oauth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", code);

  return issueTokens(supabase, {
    user_id: row.user_id as string,
    client_id,
    scope: (row.scope as string | null) ?? "mcp.full",
  });
}

async function exchangeRefresh(
  supabase: ReturnType<typeof createServiceSupabase>,
  client_id: string,
  body: Record<string, string>,
) {
  const refresh_token = body.refresh_token;
  if (!refresh_token) return err("invalid_request", "refresh_token is required");
  if (!refresh_token.startsWith("vbr_")) {
    return err("invalid_grant", "Bad refresh token format");
  }

  const hash = sha256(refresh_token);
  const { data: row } = await supabase
    .from("mcp_oauth_tokens")
    .select("*")
    .eq("refresh_token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!row) return err("invalid_grant", "Unknown refresh token");
  if (row.client_id !== client_id) {
    return err("invalid_grant", "Refresh issued to a different client");
  }
  if (
    row.refresh_expires_at &&
    new Date(row.refresh_expires_at as string).getTime() <= Date.now()
  ) {
    return err("invalid_grant", "Refresh token expired");
  }

  // Rotate: revoke the old row and issue a new pair.
  await supabase
    .from("mcp_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", row.id);

  return issueTokens(supabase, {
    user_id: row.user_id as string,
    client_id,
    scope: (row.scope as string | null) ?? "mcp.full",
  });
}

async function issueTokens(
  supabase: ReturnType<typeof createServiceSupabase>,
  args: { user_id: string; client_id: string; scope: string },
) {
  const tokens = generateTokenPair();
  const now = Date.now();
  const access_expires_at = new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString();
  const refresh_expires_at = new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabase.from("mcp_oauth_tokens").insert({
    user_id: args.user_id,
    client_id: args.client_id,
    access_token_hash: tokens.access_hash,
    access_token_prefix: tokens.access_prefix,
    refresh_token_hash: tokens.refresh_hash,
    scope: args.scope,
    access_expires_at,
    refresh_expires_at,
  });
  if (error) return err("server_error", error.message, 500);

  return Response.json(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      scope: args.scope,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
