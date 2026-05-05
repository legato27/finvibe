// Shared /authorize handler. Same code runs at the root /authorize and the
// namespaced /api/mcp/oauth/authorize so MCP clients can use either URL
// without depending on a 308 redirect.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

function errorPage(code: string, description: string) {
  return new Response(
    `<!doctype html><html><body style="font-family: system-ui; padding: 2rem;">
      <h1>OAuth error: ${code}</h1>
      <p>${description}</p>
    </body></html>`,
    { status: 400, headers: { "Content-Type": "text/html" } },
  );
}

export async function handleAuthorizeGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  const client_id = params.get("client_id") ?? "";
  const redirect_uri = params.get("redirect_uri") ?? "";
  const response_type = params.get("response_type") ?? "";
  const code_challenge = params.get("code_challenge") ?? "";
  const code_challenge_method = params.get("code_challenge_method") ?? "";
  const state = params.get("state") ?? "";
  const scope = params.get("scope") ?? "mcp.full";
  const resource = params.get("resource") ?? "";

  if (response_type !== "code") {
    return errorPage("unsupported_response_type", "Only response_type=code is supported");
  }
  if (!code_challenge || code_challenge_method !== "S256") {
    return errorPage(
      "invalid_request",
      "PKCE required: code_challenge_method=S256 and code_challenge are required",
    );
  }

  const service = createServiceSupabase();
  const { data: client, error: clientErr } = await service
    .from("mcp_oauth_clients")
    .select("id, redirect_uris, client_name")
    .eq("id", client_id)
    .maybeSingle();
  if (clientErr || !client) {
    return errorPage("invalid_client", "Unknown client_id");
  }
  if (!(client.redirect_uris as string[]).includes(redirect_uri)) {
    return errorPage("invalid_redirect_uri", "redirect_uri not registered for this client");
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }

  const consent = new URL("/oauth/consent", req.url);
  consent.searchParams.set("client_id", client_id);
  consent.searchParams.set("client_name", client.client_name as string);
  consent.searchParams.set("redirect_uri", redirect_uri);
  consent.searchParams.set("code_challenge", code_challenge);
  consent.searchParams.set("code_challenge_method", code_challenge_method);
  consent.searchParams.set("scope", scope);
  if (state) consent.searchParams.set("state", state);
  if (resource) consent.searchParams.set("resource", resource);
  return NextResponse.redirect(consent);
}
