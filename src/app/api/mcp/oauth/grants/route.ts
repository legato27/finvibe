// Combined view of the OAuth clients a user knows about:
//   - Apps the user manually registered via /api/mcp/oauth/clients
//     (visible from the moment they're created, even before any token).
//   - Apps the user has active OAuth tokens for (regardless of who
//     registered them — covers both user-registered and DCR-registered).
//
// Each row includes a status: "registered" (no active tokens yet) or
// "active" (at least one unrevoked token).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

interface GrantRow {
  client_id: string;
  client_name: string;
  status: "active" | "registered";
  owned_by_me: boolean;
  active_tokens: number;
  scope: string | null;
  registered_at: string | null;
  first_authorized_at: string | null;
  last_used_at: string | null;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Active tokens — RLS confines to user's own rows.
  const { data: tokens, error: tokErr } = await supabase
    .from("mcp_oauth_tokens")
    .select("client_id, scope, created_at, last_used_at, revoked_at")
    .is("revoked_at", null);
  if (tokErr) return NextResponse.json({ error: tokErr.message }, { status: 500 });

  // 2. Apps the user registered manually (service role to bypass the
  //    "authenticated read all clients" policy and apply our own filter).
  const service = createServiceSupabase();
  const { data: ownedClients, error: clientErr } = await service
    .from("mcp_oauth_clients")
    .select("id, client_name, created_at")
    .eq("created_by_user_id", user.id);
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  // 3. Pull names for any client_ids that appear in tokens but weren't
  //    user-registered (i.e., DCR-registered clients).
  const tokenClientIds = [...new Set((tokens ?? []).map((t) => t.client_id as string))];
  const ownedIds = new Set((ownedClients ?? []).map((c) => c.id as string));
  const missing = tokenClientIds.filter((id) => !ownedIds.has(id));
  let dcrNames = new Map<string, string>();
  if (missing.length) {
    const { data: dcr } = await service
      .from("mcp_oauth_clients")
      .select("id, client_name")
      .in("id", missing);
    dcrNames = new Map(
      (dcr ?? []).map((c) => [c.id as string, c.client_name as string]),
    );
  }

  // 4. Build the merged map keyed by client_id.
  const merged = new Map<string, GrantRow>();
  for (const c of ownedClients ?? []) {
    merged.set(c.id as string, {
      client_id: c.id as string,
      client_name: c.client_name as string,
      status: "registered",
      owned_by_me: true,
      active_tokens: 0,
      scope: null,
      registered_at: c.created_at as string,
      first_authorized_at: null,
      last_used_at: null,
    });
  }
  for (const t of tokens ?? []) {
    const id = t.client_id as string;
    const existing = merged.get(id);
    const created = t.created_at as string;
    const used = (t.last_used_at as string | null) ?? null;
    if (existing) {
      existing.status = "active";
      existing.active_tokens += 1;
      existing.scope = existing.scope ?? ((t.scope as string | null) ?? null);
      if (
        !existing.first_authorized_at ||
        created < existing.first_authorized_at
      ) {
        existing.first_authorized_at = created;
      }
      if (used && (!existing.last_used_at || used > existing.last_used_at)) {
        existing.last_used_at = used;
      }
    } else {
      merged.set(id, {
        client_id: id,
        client_name: dcrNames.get(id) ?? "Unknown app",
        status: "active",
        owned_by_me: false,
        active_tokens: 1,
        scope: (t.scope as string | null) ?? null,
        registered_at: null,
        first_authorized_at: created,
        last_used_at: used,
      });
    }
  }

  // Sort: most-recent activity (or registration) first.
  const grants = [...merged.values()].sort((a, b) => {
    const aWhen = a.last_used_at ?? a.first_authorized_at ?? a.registered_at ?? "";
    const bWhen = b.last_used_at ?? b.first_authorized_at ?? b.registered_at ?? "";
    return aWhen < bWhen ? 1 : -1;
  });
  return NextResponse.json({ grants });
}
