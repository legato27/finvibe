"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle } from "lucide-react";

interface Entry {
  action: string;
  ip_address: string | null;
  created_at: string;
}

interface Resp {
  entries: Entry[];
  last_sign_in_at: string | null;
}

export function LoginHistoryCard() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/login-history");
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
        setData(await res.json());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{t("recentActivity")}</span>
      </div>
      <div className="p-4 space-y-3">
        {data === null && !error ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> {tc("loading")}
          </div>
        ) : (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("lastSignIn")}
              </div>
              <div className="text-sm text-foreground mt-1">
                {data?.last_sign_in_at
                  ? new Date(data.last_sign_in_at).toLocaleString()
                  : t("dash")}
              </div>
            </div>
            {data && data.entries.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {t("auditEntries")}
                </div>
                <div className="border border-border/40 rounded-lg overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-background/40">
                      <tr className="text-left text-[10px] uppercase text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">{t("auditWhen")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("auditAction")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("auditIp")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {data.entries.map((e, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {new Date(e.created_at).toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-foreground">
                            {e.action}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">
                            {e.ip_address ?? t("dash")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t("auditFallback")}
              </p>
            )}
          </>
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
