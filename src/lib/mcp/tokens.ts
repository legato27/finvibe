import crypto from "node:crypto";
import type { ServiceSupabase } from "@/lib/supabase/service";
import { lookupOAuthToken } from "./oauth";

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
  if (!header) {
    console.error(`[validateBearer] no auth header`);
    return null;
  }

  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match) {
    console.error(`[validateBearer] header doesn't match Bearer pattern`);
    return null;
  }
  const secret = match[1];
  console.error(
    `[validateBearer] secret_prefix=${secret.slice(0, 12)} secret_len=${secret.length}`,
  );

  // Personal access token (vbf_…) — validated against mcp_tokens.
  if (secret.startsWith(TOKEN_PREFIX)) {
    const hash = hashToken(secret);
    const { data, error } = await supabase
      .from("mcp_tokens")
      .select("id, user_id, revoked_at")
      .eq("token_hash", hash)
      .is("revoked_at", null)
      .maybeSingle();
    if (error || !data) return null;

    void supabase
      .from("mcp_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});

    return { userId: data.user_id as string, tokenId: data.id as number };
  }

  // OAuth 2.1 access token (vbo_…) — validated against mcp_oauth_tokens.
  if (secret.startsWith("vbo_")) {
    const result = await lookupOAuthToken(supabase, secret);
    if (!result) {
      console.error(`[validateBearer] vbo_ token not found / expired / revoked`);
      return null;
    }
    return { userId: result.userId, tokenId: result.tokenId };
  }

  console.error(`[validateBearer] secret prefix not recognized`);
  return null;
}
