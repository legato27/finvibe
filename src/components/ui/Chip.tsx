"use client";

/**
 * Chip — a filter, scope or tag pill. Mono, rounded, one active style.
 * Pass `onClick` to make it a toggle (aria-pressed); omit it for a static tag.
 */
import { ReactNode } from "react";

export type ChipTone = "plain" | "signal" | "protocol" | "caution" | "short";

const TONE: Record<ChipTone, string> = {
  plain: "border-border text-muted-foreground",
  signal: "border-signal text-signal bg-signal-bg",
  protocol: "border-protocol/50 text-protocol bg-protocol-bg",
  caution: "border-signal-caution/50 text-signal-caution bg-signal-caution-bg",
  short: "border-signal-short/50 text-signal-short bg-signal-short-bg",
};

export default function Chip({
  children,
  active = false,
  tone,
  onClick,
  onRemove,
  dot,
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  tone?: ChipTone;
  onClick?: () => void;
  onRemove?: () => void;
  /** A colour class for a small square swatch before the label. */
  dot?: string;
  className?: string;
}) {
  const t = TONE[tone ?? (active ? "signal" : "plain")];
  const base = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] ${t} ${className}`;
  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick} className={`${base} transition-colors hover:border-foreground/40`}>
        {dot && <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-[2px] ${dot}`} />}
        {children}
      </button>
    );
  }
  return (
    <span className={base}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove" className="-mr-1 rounded-full px-1 hover:text-foreground">
          ×
        </button>
      )}
    </span>
  );
}
