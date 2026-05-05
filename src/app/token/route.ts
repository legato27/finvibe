// Root-level forward to /api/mcp/oauth/token. 308 preserves method + body
// so the form-encoded POST round-trips intact.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function forward(req: Request) {
  const dest = new URL("/api/mcp/oauth/token", req.url);
  return NextResponse.redirect(dest.toString(), 308);
}

export const POST = forward;
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
