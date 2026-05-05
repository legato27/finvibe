// User-facing MCP OAuth client management.
//
// This is distinct from /api/mcp/oauth/register (RFC 7591 DCR, used by MCP
// clients themselves with no auth). This endpoint requires a logged-in user
// and is intended for the in-app "Register a connected app" form, so a user
// can pre-create credentials for an app that doesn't speak DCR (or just
// wants a stable client_id for their config).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  generateClientId,
  generateClientSecret,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const client_name = String(body.client_name ?? "").trim();
  const redirect_uris_raw = body.redirect_uris;

  if (!client_name) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }
  if (!Array.isArray(redirect_uris_raw) || redirect_uris_raw.length === 0) {
    return NextResponse.json(
      { error: "redirect_uris must be a non-empty array" },
      { status: 400 },
    );
  }
  const redirect_uris: string[] = [];
  for (const uri of redirect_uris_raw) {
    if (typeof uri !== "string") {
      return NextResponse.json({ error: "redirect_uris entries must be strings" }, { status: 400 });
    }
    try {
      const u = new URL(uri);
      if (
        u.protocol !== "https:" &&
        !(u.protocol === "http:" &&
          (u.hostname === "localhost" || u.hostname === "127.0.0.1"))
      ) {
        return NextResponse.json(
          { error: `Disallowed redirect scheme: ${uri}` },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ error: `Not a valid URL: ${uri}` }, { status: 400 });
    }
    redirect_uris.push(uri);
  }

  // Manually-registered apps are always confidential — caller gets a fresh
  // client_id + client_secret pair on every call. Re-run the form to create
  // distinct credentials per app you intend to connect.
  const id = generateClientId();
  const { secret: client_secret, hash: client_secret_hash } = generateClientSecret();

  const service = createServiceSupabase();
  const { error } = await service.from("mcp_oauth_clients").insert({
    id,
    client_secret_hash,
    client_name: client_name.slice(0, 200),
    redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "client_secret_post",
    created_by_user_id: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      client_id: id,
      client_secret,
      client_name,
      redirect_uris,
      token_endpoint_auth_method: "client_secret_post",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
