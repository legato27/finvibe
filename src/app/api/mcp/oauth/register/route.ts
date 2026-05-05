// RFC 7591 — OAuth 2.0 Dynamic Client Registration.
//
// MCP clients call this to register themselves before the auth flow.
// Anyone can register (open DCR) — the user still has to consent at
// /authorize, so unauthenticated registration alone gives no access.

import { createServiceSupabase } from "@/lib/supabase/service";
import {
  generateClientId,
  generateClientSecret,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("invalid_client_metadata", "Body must be JSON");
  }

  const redirect_uris = body.redirect_uris;
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return error("invalid_redirect_uri", "redirect_uris must be a non-empty array");
  }
  for (const uri of redirect_uris) {
    if (typeof uri !== "string") {
      return error("invalid_redirect_uri", "redirect_uris entries must be strings");
    }
    try {
      const u = new URL(uri);
      // Allow http:// only for localhost (PKCE-protected clients on dev machines).
      if (
        u.protocol !== "https:" &&
        !(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))
      ) {
        return error("invalid_redirect_uri", `Disallowed scheme: ${uri}`);
      }
    } catch {
      return error("invalid_redirect_uri", `Not a valid URL: ${uri}`);
    }
  }

  const client_name =
    typeof body.client_name === "string" && body.client_name.trim()
      ? String(body.client_name).slice(0, 200)
      : "Unknown client";
  const auth_method =
    body.token_endpoint_auth_method === "client_secret_post"
      ? "client_secret_post"
      : "none";

  const id = generateClientId();
  let client_secret: string | undefined;
  let client_secret_hash: string | null = null;
  if (auth_method === "client_secret_post") {
    const pair = generateClientSecret();
    client_secret = pair.secret;
    client_secret_hash = pair.hash;
  }

  const supabase = createServiceSupabase();
  const { error: dbErr } = await supabase.from("mcp_oauth_clients").insert({
    id,
    client_secret_hash,
    client_name,
    redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: auth_method,
  });
  if (dbErr) return error("server_error", dbErr.message);

  return Response.json(
    {
      client_id: id,
      ...(client_secret ? { client_secret } : {}),
      client_name,
      redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: auth_method,
    },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function error(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
