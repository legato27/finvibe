// Some clients enter the bare `/api/mcp` URL by mistake (the canonical
// streamable-HTTP path is `/api/mcp/mcp`, where the second segment is the
// transport name `mcp-handler` expects). Forward those callers — 308
// preserves method + body so a POST to /api/mcp lands as a POST to
// /api/mcp/mcp without losing the JSON-RPC payload.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function redirect(req: Request) {
  const url = new URL("/api/mcp/mcp", req.url);
  return NextResponse.redirect(url.toString(), 308);
}

export const GET = redirect;
export const POST = redirect;
export const DELETE = redirect;
export const HEAD = redirect;
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
