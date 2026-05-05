// SERVER-ONLY. Do not import from client components.
// Uses the Supabase service-role key, which BYPASSES Row Level Security.
// Every query made through this client MUST explicitly filter by user_id
// (or scope through an owned parent row) to enforce ownership.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServiceSupabase = SupabaseClient;

export function createServiceSupabase(): ServiceSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
