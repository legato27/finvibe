import { proxyToDgx } from "@/lib/proxy";
import { NextRequest, NextResponse } from "next/server";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // TODO: Add auth check when GitHub OAuth is configured
  // import { auth } from "@/auth";
  // const session = await auth();
  // if (!session?.user) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  const { path } = await params;
  const apiPath = `/api/${path.join("/")}`;

  // Preserve query string
  const { searchParams } = request.nextUrl;
  const qs = searchParams.toString();
  const fullPath = qs ? `${apiPath}?${qs}` : apiPath;

  try {
    return await proxyToDgx(fullPath, request);
  } catch (error) {
    console.error(`Proxy error for ${fullPath}:`, error);
    return NextResponse.json(
      { error: "Backend unavailable" },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;

// Allow longer timeouts for heavy endpoints like /api/macro/dashboard
export const maxDuration = 60;
