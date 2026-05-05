"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy, Loader2, Plus } from "lucide-react";

interface CreatedClient {
  client_id: string;
  client_secret: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
}

const PRESETS: Array<{ label: string; redirect_uris: string[] }> = [
  {
    label: "Claude Desktop",
    redirect_uris: ["http://localhost:33418/oauth/callback/debug"],
  },
  {
    label: "Cursor",
    redirect_uris: ["cursor://anysphere.cursor-deeplink/mcp/oauth/callback"],
  },
  {
    label: "Cline",
    redirect_uris: ["http://localhost:3000/oauth/callback"],
  },
];

export function RegisterMcpClientCard() {
  const [name, setName] = useState("");
  const [redirectInput, setRedirectInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClient | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const redirect_uris = redirectInput
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setName(p.label);
    setRedirectInput(p.redirect_uris.join("\n"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/mcp/oauth/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: name.trim(),
          redirect_uris,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to register");
      }
      setCreated(await res.json());
      setName("");
      setRedirectInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="card mt-4">
      <div className="card-header">
        <span className="card-title">Add a connected app</span>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Each app you connect needs its own credentials. Fill in a name and
          the app&apos;s redirect URI(s), and you&apos;ll get a fresh{" "}
          <code className="font-mono">client_id</code> + <code className="font-mono">client_secret</code>{" "}
          pair (shown once). Repeat this for every distinct app you want to use
          with vibefin.
        </p>

        {!created && (
          <form onSubmit={submit} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="text-[11px] px-2 py-1 rounded border border-border bg-background/40 text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  {p.label} preset
                </button>
              ))}
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                App name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cursor on my laptop"
                required
                className="mt-1 w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Redirect URI(s) — one per line
              </label>
              <textarea
                value={redirectInput}
                onChange={(e) => setRedirectInput(e.target.value)}
                rows={3}
                placeholder={"http://localhost:33418/oauth/callback/debug"}
                required
                className="mt-1 w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Must use https://, or http://localhost / 127.0.0.1, or a
                custom-scheme URI registered by your client.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !name.trim() || redirect_uris.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary/15 border border-primary/40 text-foreground hover:bg-primary/25 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Create client
            </button>
          </form>
        )}

        {created && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <div className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Save these values now
              </div>

              <Field
                label="client_id"
                value={created.client_id}
                copied={copied === "client_id"}
                onCopy={() => copy("client_id", created.client_id)}
              />
              <Field
                label="client_secret (shown once)"
                value={created.client_secret}
                copied={copied === "client_secret"}
                onCopy={() => copy("client_secret", created.client_secret)}
              />
              <Field
                label="redirect_uris"
                value={created.redirect_uris.join(", ")}
                copied={copied === "redirect_uris"}
                onCopy={() =>
                  copy("redirect_uris", created.redirect_uris.join(","))
                }
              />
            </div>

            <button
              onClick={() => setCreated(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Register another client
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded px-2 py-1.5 break-all">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] rounded border border-border hover:border-primary/40"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
