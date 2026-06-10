/**
 * StatChip — labelled stat with optional signal coloring. Always label+value,
 * never color-only (the label carries the meaning for non-color perception).
 */
import { ReactNode } from "react";

export type ChipTone = "long" | "short" | "neutral" | "caution" | "conflict" | "plain";

const TONES: Record<ChipTone, string> = {
  long: "text-signal-long bg-signal-long-bg border-signal-long/40",
  short: "text-signal-short bg-signal-short-bg border-signal-short/40",
  neutral: "text-signal-neutral bg-signal-neutral-bg border-signal-neutral/40",
  caution: "text-signal-caution bg-signal-caution-bg border-signal-caution/40",
  conflict: "text-signal-conflict bg-signal-conflict-bg border-signal-conflict/40",
  plain: "text-foreground bg-muted border-border",
};

export default function StatChip({
  label,
  value,
  tone = "plain",
  className = "",
}: {
  label: string;
  value: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${TONES[tone]} ${className}`}
    >
      <span>{label}</span>
      <span className="nums font-mono font-semibold">{value}</span>
    </span>
  );
}
