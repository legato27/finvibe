import { createMcpHandler } from "mcp-handler";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateBearer } from "@/lib/mcp/tokens";
import { registerTools } from "@/lib/mcp/tools";
import { originOf } from "@/lib/mcp/oauth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  const supabase = createServiceSupabase();
  const auth = await validateBearer(req, supabase);
  if (!auth) {
    const resourceMetadataUrl = `${originOf(req)}/api/mcp/.well-known/oauth-protected-resource`;
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          // RFC 9728: clients use this to discover the auth server.
          "WWW-Authenticate": `Bearer realm="vibefin", resource_metadata="${resourceMetadataUrl}"`,
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "WWW-Authenticate",
        },
      },
    );
  }
  const mcp = createMcpHandler(
    (server) => {
      registerTools(server, { userId: auth.userId, supabase });
    },
    {},
    {
      basePath: "/api/mcp",
      maxDuration: 60,
      verboseLogs: false,
    },
  );
  return mcp(req);
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
