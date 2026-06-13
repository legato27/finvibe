"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthShell, authInputClass, authLabelClass } from "@/components/auth/AuthShell";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell title={t("signUpTitle")}>
        <div className="p-4 rounded-lg bg-[hsl(var(--success-bg))] border border-[hsl(var(--success))]/40 text-sm text-foreground flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] flex-shrink-0 mt-0.5" />
          <span>
            {t("checkEmail")}{" "}
            <Link href="/login" className="text-primary font-medium underline">
              {t("signInLink")}
            </Link>
            .
          </span>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("signUpTitle")} subtitle={t("signUpSubtitle")}>
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-[hsl(var(--danger-bg))] border border-[hsl(var(--danger))]/40 text-[hsl(var(--danger))] text-xs"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label htmlFor="fullName" className={authLabelClass}>
            {t("fullName")}
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={authInputClass}
            placeholder={t("fullName")}
          />
        </div>
        <div>
          <label htmlFor="email" className={authLabelClass}>
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className={authLabelClass}>
            {t("password")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-all hover:scale-[1.01] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:hover:scale-100 text-sm"
        >
          {loading ? `${t("signUpButton")}…` : t("signUpButton")}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-6">
        {t("hasAccount")}{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          {t("signInLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
