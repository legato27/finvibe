// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
// Tells MCP clients where the authorization server lives.

import { originOf } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function handler(req: Request) {
  const origin = originOf(req);
  // Point clients at the ROOT issuer rather than the namespaced one, so
  // their RFC 8414 metadata lookup (/.well-known/oauth-authorization-server)
  // hits a real endpoint instead of the path-suffixed variant
  // (/.well-known/oauth-authorization-server/api/mcp/oauth) which Next.js
  // doesn't expose by default. Endpoints are still wired at /authorize and
  // /token at the root.
  return Response.json({
    resource: `${origin}/api/mcp/mcp`,
    authorization_servers: [origin],
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
