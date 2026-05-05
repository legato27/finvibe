import { createMcpHandler } from "mcp-handler";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateBearer } from "@/lib/mcp/tokens";
import { registerTools } from "@/lib/mcp/tools";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  const supabase = createServiceSupabase();
  const auth = await validateBearer(req, supabase);
  if (!auth) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
          "Content-Type": "application/json",
        },
      },
    );
  }
  const mcp = createMcpHandler((server) => {
    registerTools(server, { userId: auth.userId, supabase });
  });
  return mcp(req);
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
