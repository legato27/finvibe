"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

interface TokenRow {
  id: number;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

interface NewToken extends TokenRow {
  secret: string;
}

export function McpTokensCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<NewToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/mcp/tokens");
      if (!res.ok) throw new Error((await res.json()).error || t("tokens.failedLoad"));
      const json = await res.json();
      setTokens(json.tokens);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || t("tokens.failedCreate"));
      const json = (await res.json()) as NewToken;
      setRevealed(json);
      setName("");
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: number) {
    if (!confirm(t("tokens.revokeConfirm"))) {
      return;
    }
    try {
      const res = await fetch(`/api/mcp/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || t("tokens.failedRevoke"));
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const mcpUrl = origin ? `${origin}/api/mcp/mcp` : "/api/mcp/mcp";

  return (
    <div className="card mt-4">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">{t("tokens.cardTitle")}</span>
        <span className="text-[10px] text-muted-foreground">
          {t("tokens.cardSubtitle")}
        </span>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          {t.rich("tokens.intro", {
            link: (chunks) => (
              <a
                href="/mcp"
                className="underline text-primary hover:text-primary/80"
              >
                {chunks}
              </a>
            ),
          })}
        </p>

        {/* Create token */}
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("tokens.namePlaceholder")}
            className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
          <button
            onClick={() => void create()}
            disabled={creating || !name.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary/15 border border-primary/40 text-foreground hover:bg-primary/25 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            {t("tokens.generate")}
          </button>
        </div>

        {/* Reveal new secret once */}
        {revealed && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <div className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {t("tokens.copyNow")}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded px-2 py-1.5 break-all">
                {revealed.secret}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(revealed.secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] rounded border border-border hover:border-primary/40"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copied ? tc("copied") : tc("copy")}
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1"
              >
                {t("dismiss")}
              </button>
            </div>
          </div>
        )}

        {/* Token list */}
        {tokens === null && !error ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> {t("tokens.loadingTokens")}
          </div>
        ) : tokens && tokens.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            {t("tokens.noTokens")}
          </div>
        ) : (
          <div className="divide-y divide-border/40 border border-border/40 rounded-lg overflow-hidden">
            {(tokens ?? []).map((tok) => (
              <div
                key={tok.id}
                className="flex items-center justify-between px-3 py-2 bg-background/30"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{tok.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {tok.token_prefix} · {t("tokens.createdLabel", { date: new Date(tok.created_at).toLocaleDateString() })}
                    {tok.last_used_at
                      ? ` · ${t("tokens.lastUsed", { when: new Date(tok.last_used_at).toLocaleString() })}`
                      : ` · ${t("tokens.neverUsed")}`}
                  </div>
                </div>
                <button
                  onClick={() => revoke(tok.id)}
                  title={t("tokens.revokeTitle")}
                  className="p-1.5 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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

        {/* How to connect */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="text-xs font-medium text-foreground">{t("tokens.howToConnect")}</div>
          <div className="text-[11px] text-muted-foreground">
            {t("tokens.endpointLabel")}{" "}
            <code className="font-mono text-foreground">{mcpUrl}</code>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("tokens.authHeaderLabel")}{" "}
            <code className="font-mono text-foreground">
              Authorization: Bearer &lt;your-token&gt;
            </code>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("tokens.genericConfig")}
            <pre className="mt-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded p-2 overflow-x-auto">
{`{
  "mcpServers": {
    "vibefin": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}`}
            </pre>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t.rich("tokens.seeRefHint", {
              link: (chunks) => (
                <a
                  href="/mcp"
                  className="underline text-foreground hover:text-primary"
                >
                  {chunks}
                </a>
              ),
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
