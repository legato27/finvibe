// RFC 8414 — root-level Authorization Server Metadata.
//
// MCP clients that don't read the resource_metadata pointer look for this
// at the host root and fall back to host-rooted /authorize, /token, /register
// defaults if it's missing. Serving it here (with our actual endpoint URLs)
// keeps those clients happy.

import { originOf } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function handler(req: Request) {
  const origin = originOf(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      // /register at the root collides with the vibefin signup page, so we
      // advertise the namespaced path. Clients that read metadata pick it
      // up; clients that hard-default to /register won't work for DCR (the
      // user can still manually register via /settings/mcp/oauth).
      registration_endpoint: `${origin}/api/mcp/oauth/register`,
      introspection_endpoint: `${origin}/api/mcp/oauth/introspect`,
      introspection_endpoint_auth_methods_supported: ["none"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: ["mcp.full"],
      service_documentation: `${origin}/mcp`,
      // RFC 9207
      authorization_response_iss_parameter_supported: true,
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
