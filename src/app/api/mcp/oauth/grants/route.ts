// List the OAuth clients the signed-in user has granted access to. One row
// per client; aggregated counts and timestamps come from mcp_oauth_tokens.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface GrantRow {
  client_id: string;
  client_name: string;
  active_tokens: number;
  scope: string | null;
  first_authorized_at: string;
  last_used_at: string | null;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS limits the user to their own rows. We pull active tokens then
  // collapse into one entry per client_id.
  const { data: tokens, error } = await supabase
    .from("mcp_oauth_tokens")
    .select("client_id, scope, created_at, last_used_at, revoked_at")
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ grants: [] });
  }

  const clientIds = [...new Set(tokens.map((t) => t.client_id as string))];
  const { data: clients } = await supabase
    .from("mcp_oauth_clients")
    .select("id, client_name")
    .in("id", clientIds);
  const nameMap = new Map<string, string>(
    (clients ?? []).map((c) => [c.id as string, c.client_name as string]),
  );

  const grouped = new Map<string, GrantRow>();
  for (const t of tokens) {
    const id = t.client_id as string;
    const existing = grouped.get(id);
    const created = t.created_at as string;
    const used = t.last_used_at as string | null;
    if (!existing) {
      grouped.set(id, {
        client_id: id,
        client_name: nameMap.get(id) ?? "Unknown app",
        active_tokens: 1,
        scope: (t.scope as string | null) ?? null,
        first_authorized_at: created,
        last_used_at: used,
      });
    } else {
      existing.active_tokens += 1;
      if (created < existing.first_authorized_at) {
        existing.first_authorized_at = created;
      }
      if (used && (!existing.last_used_at || used > existing.last_used_at)) {
        existing.last_used_at = used;
      }
    }
  }

  const grants = [...grouped.values()].sort((a, b) =>
    a.first_authorized_at < b.first_authorized_at ? 1 : -1,
  );
  return NextResponse.json({ grants });
}
