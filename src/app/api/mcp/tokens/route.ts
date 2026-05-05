import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateToken } from "@/lib/mcp/tokens";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
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

  const { secret, hash, display_prefix } = generateToken();
  const { data, error } = await supabase
    .from("mcp_tokens")
    .insert({
      user_id: user.id,
      name,
      token_hash: hash,
      token_prefix: display_prefix,
    })
    .select("id, name, token_prefix, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Secret returned exactly once; never persisted in plaintext.
  return NextResponse.json({ ...data, secret });
}
