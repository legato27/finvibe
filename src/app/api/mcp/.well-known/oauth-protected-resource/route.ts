// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
// Tells MCP clients where the authorization server lives.

import { originOf } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function handler(req: Request) {
  const origin = originOf(req);
  return Response.json({
    resource: `${origin}/api/mcp/mcp`,
    authorization_servers: [`${origin}/api/mcp/oauth`],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/mcp`,
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export const GET = handler;
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
