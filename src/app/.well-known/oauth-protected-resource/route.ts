// RFC 9728 — root-level Protected Resource Metadata.
//
// Mirrors /api/mcp/.well-known/oauth-protected-resource so clients that look
// at the host root find it.

import { originOf } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function handler(req: Request) {
  const origin = originOf(req);
  return Response.json(
    {
      resource: `${origin}/api/mcp/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/mcp`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    },
  );
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
