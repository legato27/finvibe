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
export function verifyPkceS256(code_verifier: string, code_challenge: string): boolean {
  const hash = crypto
    .createHash("sha256")
    .update(code_verifier)
    .digest()
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(code_challenge),
  );
}

// Look up an OAuth access token. Returns null if missing, expired, or revoked.
export async function lookupOAuthToken(
  supabase: ServiceSupabase,
  access_token: string,
): Promise<{ userId: string; clientId: string; tokenId: number } | null> {
  if (!access_token.startsWith(ACCESS_PREFIX)) return null;
  const hash = sha256(access_token);
  const { data, error } = await supabase
    .from("mcp_oauth_tokens")
    .select("id, user_id, client_id, access_expires_at, revoked_at")
    .eq("access_token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.access_expires_at as string).getTime() <= Date.now()) {
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
