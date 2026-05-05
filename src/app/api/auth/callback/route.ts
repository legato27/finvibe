import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next");

  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Same-origin only — defends against open-redirect abuse.
  let target = "/";
  if (nextRaw) {
    try {
      const decoded = decodeURIComponent(nextRaw);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) target = decoded;
    } catch {
      // fall through
    }
  }
  return NextResponse.redirect(`${origin}${target}`);
}
