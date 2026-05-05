import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Service-role write, but ownership-checked explicitly: must be the user
  // who registered the client. (RLS would also enforce this for cookie-auth,
  // but using service-role keeps the cascade behavior explicit.)
  const service = createServiceSupabase();
  const { error, count } = await service
    .from("mcp_oauth_clients")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("created_by_user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) {
    return NextResponse.json(
      { error: "Not found or not owned by you" },
      { status: 404 },
    );
  }
  return NextResponse.json({ deleted: true, client_id: id });
}
