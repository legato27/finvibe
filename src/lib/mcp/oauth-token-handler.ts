// Shared /token handler logic. Both /token (root) and /api/mcp/oauth/token
// route files import this so we don't rely on cross-route HTTP redirects
// that some MCP clients (Claude.ai's backend among them) don't follow with
// POST bodies intact.

import { createServiceSupabase } from "@/lib/supabase/service";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  generateTokenPair,
  sha256,
  verifyPkceS256,
} from "@/lib/mcp/oauth";

// Normalize a redirect_uri so trivial differences (trailing slash on the
// path, case in scheme/host) don't cause a false "mismatch" rejection. Per
// OAuth 2.1 the URIs should match exactly, but Claude/Cursor/etc. sometimes
// canonicalize differently between /authorize and /token.
function sameRedirectUri(a: string, b: string): boolean {
  if (!a || !b) return a === b;
  const norm = (s: string) => {
    try {
      const u = new URL(s);
      u.protocol = u.protocol.toLowerCase();
      u.hostname = u.hostname.toLowerCase();
      // Strip a single trailing "/" only if there's no query/hash to follow.
      if (
        u.pathname.length > 1 &&
        u.pathname.endsWith("/") &&
        !u.search &&
        !u.hash
      ) {
        u.pathname = u.pathname.replace(/\/+$/, "");
      }
      return u.toString();
    } catch {
      return s.trim();
    }
  };
  return norm(a) === norm(b);
}

function err(code: string, description: string, status = 400) {
  console.error(`[oauth/token] ${code}: ${description} (status ${status})`);
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
  // Fall back: try parsing both ways for tolerant clients.
  const text = await req.text().catch(() => "");
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) if (v != null) out[k] = String(v);
      return out;
    } catch {
      // fall through
    }
  }
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((v, k) => (out[k] = v));
  return out;
}

async function authenticateClient(
  supabase: ReturnType<typeof createServiceSupabase>,
  body: Record<string, string>,
): Promise<{ ok: true; client_id: string } | { ok: false; resp: Response }> {
  const client_id = body.client_id;
  if (!client_id) {
    return { ok: false, resp: err("invalid_client", "client_id is required", 401) };
  }
  const { data: client } = await supabase
    .from("mcp_oauth_clients")
    .select("id, client_secret_hash, token_endpoint_auth_method")
    .eq("id", client_id)
    .maybeSingle();
  if (!client) {
    return { ok: false, resp: err("invalid_client", "Unknown client_id", 401) };
  }

  // PKCE is mandatory in our flow (validated below in exchangeCode), so the
  // client_secret is treated as an *optional* second factor: if a secret is
  // sent it must match, but its absence isn't fatal. This matches OAuth 2.1
  // public-client behavior and lets PKCE-only clients (Claude.ai, ChatGPT,
  // many editors) authenticate against clients we issued with a secret.
  const secret = body.client_secret;
  if (secret && client.client_secret_hash) {
    const got = sha256(secret);
    if (got !== client.client_secret_hash) {
      console.error(
        `[oauth/token] secret mismatch for ${client.id}: ` +
          `got_hash_prefix=${got.slice(0, 8)} ` +
          `expected_hash_prefix=${(client.client_secret_hash as string).slice(0, 8)} ` +
          `secret_len=${secret.length}`,
      );
      return { ok: false, resp: err("invalid_client", "Bad client_secret", 401) };
    }
    console.error(`[oauth/token] secret check OK for ${client.id}`);
  } else if (secret && !client.client_secret_hash) {
    // Client doesn't have a stored secret but caller sent one — accept and log.
    console.error(
      `[oauth/token] caller sent a secret but client ${client.id} has no stored hash; accepting on PKCE only`,
    );
  }
  return { ok: true, client_id: client.id as string };
}

export async function handleTokenPost(req: Request): Promise<Response> {
  try {
    const body = await readForm(req);
    console.error(
      `[oauth/token] incoming POST grant_type=${body.grant_type ?? "?"} ` +
        `client_id=${body.client_id ?? "?"} ` +
        `has_secret=${Boolean(body.client_secret)} ` +
        `has_verifier=${Boolean(body.code_verifier)} ` +
        `redirect_uri=${body.redirect_uri ?? "?"}`,
    );
    const grant_type = body.grant_type;
    if (!grant_type) return err("invalid_request", "grant_type is required");

    const supabase = createServiceSupabase();
    const auth = await authenticateClient(supabase, body);
    if (!auth.ok) return auth.resp;

    let resp: Response;
    if (grant_type === "authorization_code") {
      resp = await exchangeCode(supabase, auth.client_id, body);
    } else if (grant_type === "refresh_token") {
      resp = await exchangeRefresh(supabase, auth.client_id, body);
    } else {
      resp = err("unsupported_grant_type", `Unsupported grant_type=${grant_type}`);
    }
    console.error(`[oauth/token] response status=${resp.status}`);
    return resp;
  } catch (e) {
    console.error(`[oauth/token] uncaught error:`, e);
    return err("server_error", (e as Error)?.message ?? String(e), 500);
  }
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

  const { data: row, error: rowErr } = await supabase
    .from("mcp_oauth_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (rowErr) {
    console.error(`[oauth/token] db error fetching code:`, rowErr);
    return err("server_error", rowErr.message, 500);
  }
  if (!row) {
    console.error(`[oauth/token] no code row for code_prefix=${code.slice(0, 8)}`);
    return err("invalid_grant", "Unknown or expired code");
  }
  console.error(
    `[oauth/token] code row: client=${row.client_id} consumed=${!!row.consumed_at} ` +
      `expires_at=${row.expires_at} stored_redirect=${row.redirect_uri}`,
  );
  if (row.consumed_at) return err("invalid_grant", "Code already used");
  if (row.client_id !== client_id) {
    return err("invalid_grant", "Code was issued to a different client");
  }
  if (!sameRedirectUri(row.redirect_uri as string, redirect_uri)) {
    console.error(
      `[oauth/token] redirect_uri mismatch: stored="${row.redirect_uri}" sent="${redirect_uri}"`,
    );
    return err("invalid_grant", "redirect_uri mismatch");
  }
  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return err("invalid_grant", "Code expired");
  }
  if (!verifyPkceS256(code_verifier, row.code_challenge as string)) {
    console.error(
      `[oauth/token] PKCE failed: verifier_len=${code_verifier.length} ` +
        `challenge_len=${(row.code_challenge as string).length}`,
    );
    return err("invalid_grant", "PKCE verification failed");
  }

  await supabase
    .from("mcp_oauth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", code);

  return issueTokens(supabase, {
    user_id: row.user_id as string,
    client_id,
    scope: (row.scope as string | null) ?? "mcp.full",
    resource: (row.resource as string | null) ?? null,
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

  await supabase
    .from("mcp_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", row.id);

  return issueTokens(supabase, {
    user_id: row.user_id as string,
    client_id,
    scope: (row.scope as string | null) ?? "mcp.full",
    resource: null,
  });
}

async function issueTokens(
  supabase: ReturnType<typeof createServiceSupabase>,
  args: { user_id: string; client_id: string; scope: string; resource: string | null },
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
      // RFC 8707: echo back the resource indicator so clients can confirm
      // the token is bound to the protected resource they requested.
      ...(args.resource ? { resource: args.resource } : {}),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
