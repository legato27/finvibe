"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

interface Grant {
  client_id: string;
  client_name: string;
  status: "active" | "registered";
  owned_by_me: boolean;
  active_tokens: number;
  scope: string | null;
  registered_at: string | null;
  first_authorized_at: string | null;
  last_used_at: string | null;
}

export function McpOauthGrantsCard() {
  const t = useTranslations("settings");
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/mcp/oauth/grants");
      if (!res.ok) throw new Error((await res.json()).error || t("grants.failedLoad"));
      const json = await res.json();
      setGrants(json.grants);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    function onChange() {
      void load();
    }
    window.addEventListener("mcp-clients-changed", onChange);
    return () => window.removeEventListener("mcp-clients-changed", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revokeTokens(g: Grant) {
    if (
      !confirm(
        t("grants.revokeConfirm", {
          name: g.client_name,
          count: g.active_tokens,
          plural: g.active_tokens === 1 ? "" : "s",
        }),
      )
    ) {
      return;
    }
    setBusyId(g.client_id);
    try {
      const res = await fetch(
        `/api/mcp/oauth/grants/${encodeURIComponent(g.client_id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error || t("grants.failedRevoke"));
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteClient(g: Grant) {
    if (
      !confirm(t("grants.deleteConfirm", { name: g.client_name }))
    ) {
      return;
    }
    setBusyId(g.client_id);
    try {
      const res = await fetch(
        `/api/mcp/oauth/clients/${encodeURIComponent(g.client_id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error || t("grants.failedDelete"));
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card mt-4">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">{t("grants.cardTitle")}</span>
        <span className="text-[10px] text-muted-foreground">
          {t("grants.cardSubtitle")}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("grants.intro")}
        </p>

        {grants === null && !error ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> {t("grants.loading")}
          </div>
        ) : grants && grants.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            {t.rich("grants.noneYet", {
              endpoint: () => <code>/api/mcp/mcp</code>,
            })}
          </div>
        ) : (
          <div className="divide-y divide-border/40 border border-border/40 rounded-lg overflow-hidden">
            {(grants ?? []).map((g) => (
              <div
                key={g.client_id}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-background/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground truncate">
                      {g.client_name}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${
                        g.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-muted/30 text-muted-foreground border border-border/40"
                      }`}
                    >
                      {g.status === "active"
                        ? t("grants.statusActive")
                        : t("grants.statusRegistered")}
                    </span>
                    {g.owned_by_me && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded text-muted-foreground border border-border/40">
                        {t("grants.registeredByYou")}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {g.client_id}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {g.status === "active"
                      ? t("grants.activeTokens", { count: g.active_tokens })
                      : t("grants.noActive")}
                    {g.registered_at &&
                      ` · ${t("grants.registeredOn", { date: new Date(g.registered_at).toLocaleDateString() })}`}
                    {g.first_authorized_at &&
                      ` · ${t("grants.firstAuth", { date: new Date(g.first_authorized_at).toLocaleDateString() })}`}
                    {g.last_used_at
                      ? ` · ${t("grants.lastUsed", { when: new Date(g.last_used_at).toLocaleString() })}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {g.status === "active" && (
                    <button
                      onClick={() => revokeTokens(g)}
                      disabled={busyId === g.client_id}
                      title={t("grants.signOutTitle")}
                      className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-amber-400 hover:border-amber-400/40 disabled:opacity-50"
                    >
                      {t("grants.signOut")}
                    </button>
                  )}
                  {g.owned_by_me && (
                    <button
                      onClick={() => deleteClient(g)}
                      disabled={busyId === g.client_id}
                      title={t("grants.deleteTitle")}
                      className="p-1.5 text-muted-foreground hover:text-red-400 disabled:opacity-50"
                    >
                      {busyId === g.client_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
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
