// OAuth 2.1 + PKCE primitives for the MCP server.
//
// Token format:
//   - access tokens   :  vbo_<48 random hex>
//   - refresh tokens  :  vbr_<48 random hex>
//   - client_id       :  vbc_<24 random hex>
// Stored as sha256 hashes; plaintext returned to the client exactly once.

import crypto from "node:crypto";
import type { ServiceSupabase } from "@/lib/supabase/service";

export const ACCESS_TTL_SECONDS = 60 * 60;            // 1 hour
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const CODE_TTL_SECONDS = 60 * 5;               // 5 min

const ACCESS_PREFIX = "vbo_";
const REFRESH_PREFIX = "vbr_";
const CLIENT_PREFIX = "vbc_";

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function maskToken(secret: string): string {
  if (secret.length <= 12) return secret;
  return `${secret.slice(0, 12)}…${secret.slice(-4)}`;
}

export function generateClientId(): string {
  return CLIENT_PREFIX + crypto.randomBytes(12).toString("hex");
}

export function generateClientSecret(): { secret: string; hash: string } {
  const secret = crypto.randomBytes(32).toString("hex");
  return { secret, hash: sha256(secret) };
}

export function generateAuthorizationCode(): string {
  return crypto.randomBytes(24).toString("hex");
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  access_hash: string;
  refresh_hash: string;
  access_prefix: string;
}

export function generateTokenPair(): IssuedTokens {
  const access_token = ACCESS_PREFIX + crypto.randomBytes(32).toString("hex");
  const refresh_token = REFRESH_PREFIX + crypto.randomBytes(32).toString("hex");
  return {
    access_token,
    refresh_token,
    access_hash: sha256(access_token),
    refresh_hash: sha256(refresh_token),
    access_prefix: maskToken(access_token),
  };
}

// PKCE: verify that sha256(code_verifier) base64url-encoded == code_challenge
// (we only support S256, the only method the MCP spec mandates).
//
// Plain string compare (not timingSafeEqual) on purpose: PKCE values are
// short, the auth code is single-use, and timingSafeEqual throws on
// length mismatch which becomes a 500 + generic "rejected the credentials"
// surface error. Both sides are normalized to padded-stripped base64url so
// we don't reject because one side included `=` padding and the other
// didn't.
export function verifyPkceS256(code_verifier: string, code_challenge: string): boolean {
  if (!code_verifier || !code_challenge) return false;
  const computed = crypto
    .createHash("sha256")
    .update(code_verifier)
    .digest("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const normalized = code_challenge
    .trim()
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return computed === normalized;
}

// Look up an OAuth access token. Returns null if missing, expired, or revoked.
//
// Audience binding (RFC 8707 / MCP spec "MCP servers MUST only accept tokens
// specifically intended for themselves"): this authorization server issues
// tokens for exactly one MCP resource (this server), and the token endpoint
// rejects any authorization request whose `resource` targets a different host
// (see exchangeCode). Every row in mcp_oauth_tokens is therefore, by
// construction, audience-bound to this server — a token issued here can never
// be valid for another resource. The optional `resource` column (migration
// 015) records the exact bound URI for audit and future per-resource checks.
export async function lookupOAuthToken(
  supabase: ServiceSupabase,
  access_token: string,
): Promise<{ userId: string; clientId: string; tokenId: number; scope: string | null } | null> {
  if (!access_token.startsWith(ACCESS_PREFIX)) {
    console.error(`[lookupOAuthToken] wrong prefix: ${access_token.slice(0, 6)}`);
    return null;
  }
  const hash = sha256(access_token);
  const { data, error } = await supabase
    .from("mcp_oauth_tokens")
    .select("id, user_id, client_id, scope, access_expires_at, revoked_at")
    .eq("access_token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error(`[lookupOAuthToken] db error:`, error);
    return null;
  }
  if (!data) {
    console.error(
      `[lookupOAuthToken] no row for hash_prefix=${hash.slice(0, 8)} (token_prefix=${access_token.slice(0, 12)})`,
    );
    return null;
  }
  if (new Date(data.access_expires_at as string).getTime() <= Date.now()) {
    console.error(
      `[lookupOAuthToken] token expired: id=${data.id} expires_at=${data.access_expires_at}`,
    );
    return null;
  }
  void supabase
    .from("mcp_oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});
  return {
    userId: data.user_id as string,
    clientId: data.client_id as string,
    tokenId: data.id as number,
    scope: (data.scope as string | null) ?? null,
  };
}

// Derive the canonical public origin from the request. Prefer x-forwarded-host
// (set by Vercel) so we get fin.vibelife.sg rather than vibefin.vercel.app.
export function originOf(req: Request): string {
  const xfHost = req.headers.get("x-forwarded-host");
  const xfProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (xfHost) return `${xfProto}://${xfHost}`;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export function publicUrl(req: Request, path: string): string {
  return `${originOf(req)}${path}`;
}
