"use client";

/**
 * Segmented — the one tab / toggle control.
 *
 * Replaces five hand-rolled tab bars. `mode="tabs"` gives real tablist
 * semantics with arrow-key movement, for switching panels on one page.
 * `mode="toggle"` gives aria-pressed buttons, for a view or scope switch.
 * Links between pages are not this: use <Link aria-current="page">.
 */
import { useId, useRef, KeyboardEvent } from "react";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; count?: number };

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  mode = "toggle",
  size = "md",
  ariaLabel,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  mode?: "tabs" | "toggle";
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (mode !== "tabs") return;
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  return (
    <div
      role={mode === "tabs" ? "tablist" : "group"}
      aria-label={ariaLabel}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control border border-border bg-card p-0.5 ${className}`}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const stateProps =
          mode === "tabs"
            ? { role: "tab", "aria-selected": on, id: `${id}-tab-${o.value}`, tabIndex: on ? 0 : -1 }
            : { "aria-pressed": on };
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            {...stateProps}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-colors ${pad} ${
              on ? "bg-primary font-bold text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span className={`nums font-mono text-[11px] ${on ? "text-primary-foreground/70" : "text-dim"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
