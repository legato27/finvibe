import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /**
     * Everything except static assets — and /api.
     *
     * updateSession already treats every /api path as public, so running it
     * there only ever did two things: added a Supabase auth round trip in
     * front of every proxied DGX call, and attached a refreshed session
     * cookie to some of the responses. The second is the expensive one — a
     * response carrying Set-Cookie is not cached by the CDN, so the edge
     * tier the proxy now sets Cache-Control for would have been silently
     * skipped on exactly the requests that refreshed a token.
     *
     * Nothing loses its session by this: the browser client refreshes its
     * own token, and the local API routes that need a user
     * (/api/enrich, /api/mcp/*, /api/settings/*) build their own server
     * client, which reads and re-sets the cookies itself.
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
};
