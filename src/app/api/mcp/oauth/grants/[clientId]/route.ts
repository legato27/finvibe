// Revoke every active OAuth token the signed-in user has for a given client.
// Cookie-auth (web only). Service role isn't needed — RLS confines to the
// signed-in user, and the update only touches their own rows.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("mcp_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ revoked: count ?? 0, client_id: clientId });
}
