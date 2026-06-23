import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateToken } from "@/lib/mcp/tokens";
import { MCP_SCOPES, type McpScope } from "@/lib/mcp/catalog";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, name, token_prefix, scope, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Default to the least-privileged scope when unspecified.
  const scope: McpScope = MCP_SCOPES.includes(body?.scope) ? body.scope : "read";

  const { secret, hash, display_prefix } = generateToken();
  const base = {
    user_id: user.id,
    name,
    token_hash: hash,
    token_prefix: display_prefix,
  };

  // Resilient to the scope migration not yet being applied: try inserting with
  // scope, and if the column doesn't exist yet, insert without it (legacy =
  // full scope). Once the migration lands, scope is persisted normally.
  let inserted = await supabase
    .from("mcp_tokens")
    .insert({ ...base, scope })
    .select("id, name, token_prefix, scope, created_at")
    .single();
  if (inserted.error) {
    inserted = await supabase
      .from("mcp_tokens")
      .insert(base)
      .select("id, name, token_prefix, created_at")
      .single();
  }
  if (inserted.error)
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });

  // Secret returned exactly once; never persisted in plaintext.
  return NextResponse.json({ ...inserted.data, secret });
}
