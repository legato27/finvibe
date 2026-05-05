"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

interface Grant {
  client_id: string;
  client_name: string;
  active_tokens: number;
  scope: string | null;
  first_authorized_at: string;
  last_used_at: string | null;
}

export function McpOauthGrantsCard() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/mcp/oauth/grants");
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const json = await res.json();
      setGrants(json.grants);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(grant: Grant) {
    if (
      !confirm(
        `Revoke access for ${grant.client_name}?\n\nThis will sign out ${grant.active_tokens} active token${grant.active_tokens === 1 ? "" : "s"} and the app will need to re-authorize to reconnect.`,
      )
    ) {
      return;
    }
    setRevokingId(grant.client_id);
    try {
      const res = await fetch(
        `/api/mcp/oauth/grants/${encodeURIComponent(grant.client_id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error || "Failed to revoke");
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="card mt-4">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">Connected apps (OAuth)</span>
        <span className="text-[10px] text-muted-foreground">
          MCP clients that finished the OAuth flow
        </span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Apps that you authorized via the in-browser OAuth consent flow.
          Revoking immediately invalidates every active access and refresh
          token for that app — the app will need to re-authorize.
        </p>

        {grants === null && !error ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </div>
        ) : grants && grants.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No OAuth-connected apps yet. MCP clients can connect by pointing
            at <code className="font-mono">/api/mcp/mcp</code> with no header
            — they&apos;ll be guided through OAuth automatically.
          </div>
        ) : (
          <div className="divide-y divide-border/40 border border-border/40 rounded-lg overflow-hidden">
            {(grants ?? []).map((g) => (
              <div
                key={g.client_id}
                className="flex items-center justify-between px-3 py-2 bg-background/30"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {g.client_name}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {g.client_id} · {g.active_tokens} active token
                    {g.active_tokens === 1 ? "" : "s"} · authorized{" "}
                    {new Date(g.first_authorized_at).toLocaleDateString()}
                    {g.last_used_at
                      ? ` · last used ${new Date(g.last_used_at).toLocaleString()}`
                      : " · never used"}
                  </div>
                </div>
                <button
                  onClick={() => revoke(g)}
                  disabled={revokingId === g.client_id}
                  title="Revoke all tokens for this app"
                  className="p-1.5 text-muted-foreground hover:text-red-400 disabled:opacity-50"
                >
                  {revokingId === g.client_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
