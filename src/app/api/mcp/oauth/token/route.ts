import { handleTokenPost } from "@/lib/mcp/oauth-token-handler";

export const dynamic = "force-dynamic";

export const POST = handleTokenPost;

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
