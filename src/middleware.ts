import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  // Auth disabled for now — allow all requests through.
  // When ready, replace this with:
  //   export { auth as middleware } from "@/auth";
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
