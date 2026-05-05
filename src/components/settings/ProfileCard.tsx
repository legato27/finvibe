"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { useProfile, useUpdateProfile } from "@/lib/supabase/hooks";

export function ProfileCard() {
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile?.display_name]);

  async function save() {
    try {
      await update.mutateAsync({ display_name: displayName.trim() });
      setSavedAt(Date.now());
    } catch {
      // mutation surfaces the error below
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">Profile</span>
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
          {isLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Email
                </label>
                <div className="mt-1 text-sm text-foreground font-mono">
                  {profile?.email ?? "—"}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Your email is set at sign-up. Changing it is not currently
                  supported via this UI; contact support if you need to update.
                </p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Display name
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={save}
                    disabled={update.isPending}
                    className="px-3 py-2 text-sm rounded-lg bg-primary/15 border border-primary/40 text-foreground hover:bg-primary/25 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>

              {update.isError && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div>{(update.error as Error)?.message}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
