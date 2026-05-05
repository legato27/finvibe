// Root-level /authorize endpoint. Serves the request directly (no redirect)
// because some MCP clients ignore our advertised authorization_endpoint and
// hard-default to the resource origin's /authorize.

import { handleAuthorizeGet } from "@/lib/mcp/oauth-authorize-handler";

export const dynamic = "force-dynamic";

export const GET = handleAuthorizeGet;
