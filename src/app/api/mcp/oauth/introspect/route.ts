// RFC 7662 Token Introspection.
//
// Some OAuth clients verify a freshly issued token by introspecting it
// before using it for actual API calls. If we don't expose this endpoint
// they may treat the token as invalid.

import { createServiceSupabase } from "@/lib/supabase/service";
import { sha256 } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  const body = await readForm(req);
  const token = body.token;
  if (!token) {
    return Response.json(
      { active: false },
      { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
    );
  }

  const supabase = createServiceSupabase();

  // Try OAuth access token first (vbo_…), then refresh (vbr_…).
  let row: Record<string, unknown> | null = null;
  let kind: "access" | "refresh" | null = null;
  if (token.startsWith("vbo_")) {
    const hash = sha256(token);
    const r = await supabase
      .from("mcp_oauth_tokens")
      .select("user_id, client_id, scope, access_expires_at, revoked_at")
      .eq("access_token_hash", hash)
      .is("revoked_at", null)
      .maybeSingle();
    row = r.data ?? null;
    kind = "access";
  } else if (token.startsWith("vbr_")) {
    const hash = sha256(token);
    const r = await supabase
      .from("mcp_oauth_tokens")
      .select("user_id, client_id, scope, refresh_expires_at, revoked_at")
      .eq("refresh_token_hash", hash)
      .is("revoked_at", null)
      .maybeSingle();
    row = r.data ?? null;
    kind = "refresh";
  }

  if (!row) {
    return Response.json(
      { active: false },
      { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
    );
  }

  const expiresAtKey = kind === "access" ? "access_expires_at" : "refresh_expires_at";
  const exp = row[expiresAtKey] as string | null;
  const expSec = exp ? Math.floor(new Date(exp).getTime() / 1000) : null;
  if (expSec && expSec * 1000 <= Date.now()) {
    return Response.json(
      { active: false },
      { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
    );
  }

  return Response.json(
    {
      active: true,
      scope: row.scope ?? "mcp.full",
      client_id: row.client_id,
      token_type: "Bearer",
      ...(expSec ? { exp: expSec } : {}),
      sub: row.user_id,
    },
    { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
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
