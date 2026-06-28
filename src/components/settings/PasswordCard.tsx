"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function PasswordCard() {
  const t = useTranslations("settings");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError(t("errPwLen"));
      return;
    }
    if (pw !== confirm) {
      setError(t("errPwMismatch"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: e2 } = await supabase.auth.updateUser({ password: pw });
      if (e2) throw new Error(e2.message);
      setSavedAt(Date.now());
      setPw("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span className="card-title">{t("changePassword")}</span>
        {savedAt && !busy && (
          <span className="flex items-center gap-1 text-[10px] text-success">
            <Check className="w-3 h-3" /> {t("password.updatedShort")}
          </span>
        )}
      </div>
      <form onSubmit={submit} className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("passwordIntroLong")}
        </p>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("newPassword")}
          </label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t("passwordHint")}
            className="mt-1 w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("confirmNewPassword")}
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
            autoComplete="new-password"
            required
          />
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !pw}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary/15 border border-primary/40 text-foreground hover:bg-primary/25 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t("updatePassword")}
        </button>
      </form>
    </div>
  );
}
