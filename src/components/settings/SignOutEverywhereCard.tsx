"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, AlertCircle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutEverywhereCard() {
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function signOutEverywhere() {
    if (!confirm(t("signOutEverywhereConfirm"))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: e } = await supabase.auth.signOut({ scope: "global" });
      if (e) throw new Error(e.message);
      router.push("/login");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card mt-4">
      <div className="card-header">
        <span className="card-title">{t("signOutEverywhere")}</span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("signOutEverywhereLong")}
        </p>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}
        <button
          onClick={signOutEverywhere}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          {t("signOutEverywhere")}
        </button>
      </div>
    </div>
  );
}
