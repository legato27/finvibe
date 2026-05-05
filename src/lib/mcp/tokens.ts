import crypto from "node:crypto";
import type { ServiceSupabase } from "@/lib/supabase/service";

const TOKEN_PREFIX = "vbf_";

export interface NewToken {
  secret: string;       // shown once to the user
  hash: string;         // stored in mcp_tokens.token_hash
  display_prefix: string; // stored in mcp_tokens.token_prefix
}

export function generateToken(): NewToken {
  const secret = TOKEN_PREFIX + crypto.randomBytes(32).toString("hex");
  return {
    secret,
    hash: hashToken(secret),
    display_prefix: maskToken(secret),
  };
}

export function hashToken(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function maskToken(secret: string): string {
  if (secret.length <= 12) return secret;
  return `${secret.slice(0, 12)}…${secret.slice(-4)}`;
}

export interface TokenContext {
  userId: string;
  tokenId: number;
}

export async function validateBearer(
  req: Request,
  supabase: ServiceSupabase,
): Promise<TokenContext | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match) return null;
  const secret = match[1];
  if (!secret.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(secret);
  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;

  // Update last_used_at without blocking the request.
  void supabase
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { userId: data.user_id as string, tokenId: data.id as number };
}
