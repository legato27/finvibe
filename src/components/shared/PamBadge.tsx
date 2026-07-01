"use client";
import { directionBadgeClass, normalizeDirection } from "@/lib/signals";

/** Compact Price Action (PAM) summary attached to ranked-book / options-book rows. */
export interface PamSummary {
  setup: string | null;
  direction: "long" | "short" | null;
  status: string | null;
  confidence: string | null;
  monthly: string | null;
  weekly: string | null;
  daily: string | null;
  /** nearest weekly swing pivots straddling the close (support / resistance) */
  swing_low?: number | null;
  swing_high?: number | null;
}

export function PamBadge({ pam }: { pam?: PamSummary | null }) {
  if (!pam || !pam.setup) return <span className="text-muted-foreground">—</span>;
  const color = directionBadgeClass(normalizeDirection(pam.direction));
  // Watch (no daily FSB trigger) reads dimmer than a triggered setup.
  const dim = pam.status === "triggered" ? "" : "opacity-60";
  const title =
    `M:${pam.monthly ?? "—"} · W:${pam.weekly ?? "—"} · D:${pam.daily ?? "—"}` +
    (pam.confidence ? ` · ${pam.confidence} conviction` : "");
  return (
    <span
      title={title}
      className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border ${color} ${dim}`}
    >
      {pam.setup}
    </span>
  );
}
