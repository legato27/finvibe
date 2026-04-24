"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Loader2, AlertCircle } from "lucide-react";
import { useProfile, useUpdateProfile, useFxRates } from "@/lib/supabase/hooks";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_LABELS,
  type Currency,
} from "@/lib/currency";

export default function SettingsPage() {
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();

  const [currency, setCurrency] = useState<Currency>("USD");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.default_currency) {
      setCurrency(profile.default_currency as Currency);
    }
  }, [profile?.default_currency]);

  // Preview FX from the user's current selection so they can see live rates.
  const { data: fx, isLoading: fxLoading } = useFxRates(currency);

  async function handleSave(next: Currency) {
    setCurrency(next);
    try {
      await update.mutateAsync({ default_currency: next });
      setSavedAt(Date.now());
    } catch (e) {
      /* the mutation's error state surfaces below */
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Preferences that apply to your whole account.
      </p>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">Default Currency</span>
          {update.isPending && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {savedAt && !update.isPending && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Your portfolio totals and risk analysis will be displayed in this
            currency. Holdings priced in other currencies are converted using
            live yfinance spot rates (refreshed hourly).
          </p>

          {isLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SUPPORTED_CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => handleSave(c)}
                  disabled={update.isPending}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                    currency === c
                      ? "bg-primary/15 border-primary/50 text-foreground"
                      : "bg-background/50 border-border hover:border-primary/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div>
                    <div className="text-sm font-mono font-semibold">{c}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {CURRENCY_LABELS[c]}
                    </div>
                  </div>
                  {currency === c && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {update.isError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                {(update.error as Error)?.message ||
                  "Could not save — check migration 009 has been applied."}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">Live FX Rates</span>
          <span className="text-[10px] text-muted-foreground">base {currency}</span>
        </div>
        <div className="p-4">
          {fxLoading && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading rates…
            </div>
          )}
          {fx && (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {Object.entries(fx.rates)
                  .filter(([q]) => q !== currency)
                  .map(([quote, rate]) => (
                    <div
                      key={quote}
                      className="px-3 py-2 rounded-lg border border-border/40 bg-background/50"
                    >
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {currency} → {quote}
                      </div>
                      <div className="text-sm font-mono text-foreground mt-0.5">
                        {rate.toFixed(4)}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="text-[10px] text-muted-foreground">
                as of {new Date(fx.as_of).toLocaleString()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
