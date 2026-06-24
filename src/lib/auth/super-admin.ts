// Super-admin allowlist.
//
// Super admins are the only users permitted to trigger the (expensive) stock
// enrichment pipeline — both the `/api/enrich` HTTP route and the
// `enrich_stock` MCP tool. Every other user is blocked from enrichment; they
// still read whatever the shared stock_catalog already holds.
//
// Configure with the SUPER_ADMIN_EMAILS env var (comma-separated). When unset,
// it falls back to the app owner. This module is pure (no server-only imports)
// so it is safe to import from client code too.

import type { ServiceSupabase } from "@/lib/supabase/service";

const FALLBACK_SUPER_ADMINS = ["legato27@gmail.com"];

function adminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  const parsed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : FALLBACK_SUPER_ADMINS;
}

/** True if the given email belongs to a super admin (case-insensitive). */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/**
 * Resolve a Supabase user id to super-admin status via the profiles.email
 * column. Uses whatever client is passed (service-role on the MCP path).
 * Returns false on any miss so enrichment fails closed.
 */
export async function isSuperAdminUserId(
  userId: string,
  supabase: ServiceSupabase,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return isSuperAdminEmail((data as { email?: string | null } | null)?.email);
}
