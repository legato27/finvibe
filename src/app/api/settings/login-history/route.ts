// Best-effort login history pulled from Supabase's auth.audit_log_entries
// table (which lives in the auth schema and requires the service role).
//
// Each entry's payload is JSONB; we filter on actor_id == user.id and pull
// the action + ip_address + created_at. If the audit table isn't readable
// (different Supabase plan / permissions), we fall back to last_sign_in_at
// from auth.users so the page never errors.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

interface LoginEntry {
  action: string;
  ip_address: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceSupabase();
  const result: { entries: LoginEntry[]; last_sign_in_at: string | null } = {
    entries: [],
    last_sign_in_at: user.last_sign_in_at ?? null,
  };

  // Try the audit log first. The service role can bypass RLS; we still
  // filter strictly by actor_id so we never return another user's rows.
  try {
    const { data, error } = await service
      .schema("auth")
      .from("audit_log_entries")
      .select("payload, ip_address, created_at")
      .eq("payload->>actor_id", user.id)
      .in("payload->>action", [
        "login",
        "logout",
        "user_signedup",
        "token_refreshed",
        "user_updated",
      ])
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) {
      result.entries = data.map((row) => ({
        action: ((row.payload as { action?: string })?.action) ?? "unknown",
        ip_address: (row.ip_address as string | null) ?? null,
        created_at: row.created_at as string,
      }));
    }
  } catch {
    // audit table may not be readable — silently fall back to last_sign_in_at
  }

  return NextResponse.json(result);
}
