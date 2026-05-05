// Root-level forward to /api/mcp/oauth/authorize.
//
// Some MCP clients (notably Claude.ai) ignore the metadata's
// authorization_endpoint and default to the resource origin's /authorize.
// 308 preserves method (GET) and the full query string carries to the real
// handler, which renders the existing login + consent flow.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function forward(req: Request) {
  const src = new URL(req.url);
  const dest = new URL("/api/mcp/oauth/authorize", src);
  dest.search = src.search;
  return NextResponse.redirect(dest.toString(), 308);
}

export const GET = forward;
export const POST = forward;
