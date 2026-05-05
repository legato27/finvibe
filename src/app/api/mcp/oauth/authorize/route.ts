// OAuth 2.1 authorization endpoint.
//
// Validates the client + redirect_uri + PKCE challenge, then either
// (a) redirects to /login if the user isn't signed in, or
// (b) redirects to /oauth/consent so the user can approve.
//
// On approve, /oauth/consent (POST) creates the authorization code and
// redirects back to the client.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const client_id = params.get("client_id") ?? "";
  const redirect_uri = params.get("redirect_uri") ?? "";
  const response_type = params.get("response_type") ?? "";
  const code_challenge = params.get("code_challenge") ?? "";
  const code_challenge_method = params.get("code_challenge_method") ?? "";
  const state = params.get("state") ?? "";
  const scope = params.get("scope") ?? "mcp.full";

  if (response_type !== "code") {
    return errorPage("unsupported_response_type", "Only response_type=code is supported");
  }
  if (!code_challenge || code_challenge_method !== "S256") {
    return errorPage(
      "invalid_request",
      "PKCE required: code_challenge_method=S256 and code_challenge are required",
    );
  }

  // Validate the client + redirect_uri (using service role since this isn't tied to a user yet).
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

  // Check if the user is signed in to vibefin.
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — bounce to /login, then back here.
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }

  // Signed in — go to consent screen with the original params.
  const consent = new URL("/oauth/consent", req.url);
  consent.searchParams.set("client_id", client_id);
  consent.searchParams.set("client_name", client.client_name as string);
  consent.searchParams.set("redirect_uri", redirect_uri);
  consent.searchParams.set("code_challenge", code_challenge);
  consent.searchParams.set("code_challenge_method", code_challenge_method);
  consent.searchParams.set("scope", scope);
  if (state) consent.searchParams.set("state", state);
  return NextResponse.redirect(consent);
}

function errorPage(code: string, description: string) {
  return new Response(
    `<!doctype html><html><body style="font-family: system-ui; padding: 2rem;">
      <h1>OAuth error: ${code}</h1>
      <p>${description}</p>
    </body></html>`,
    { status: 400, headers: { "Content-Type": "text/html" } },
  );
}
