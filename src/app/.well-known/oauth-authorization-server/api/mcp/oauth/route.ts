// RFC 8414 path-suffixed metadata for the issuer
// `${origin}/api/mcp/oauth`. Some MCP clients (Claude.ai included) follow
// the spec literally and look for metadata at this exact path before
// falling back to other conventions. Serve the same content the namespaced
// metadata returns so the discovery chain succeeds either way.

import { originOf } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function handler(req: Request) {
  const origin = originOf(req);
  const issuer = `${origin}/api/mcp/oauth`;
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/api/mcp/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: ["mcp.full"],
      service_documentation: `${origin}/mcp`,
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
