"use client";

/**
 * Disclosure — a collapsed section with a real heading and aria-expanded.
 * Used for the heavy parts of a page (an options chain, a model grid) that
 * belong on the page but not in the first screen. `open` can be driven by
 * the URL so deep links land on the section expanded.
 */
import { useEffect, useId, useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function Disclosure({
  id,
  label,
  qualifier,
  aside,
  open: openProp,
  children,
  className = "",
}: {
  id?: string;
  label: ReactNode;
  qualifier?: ReactNode;
  aside?: ReactNode;
  open?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(!!openProp);
  useEffect(() => { if (openProp !== undefined) setOpen(openProp); }, [openProp]);
  const panelId = useId();
  return (
    <section id={id} className={`card scroll-mt-24 ${open ? "" : "py-3"} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} aria-hidden="true" />
          <span className="card-title">
            {label}
            {qualifier && <span className="normal-case tracking-normal text-dim"> · {qualifier}</span>}
          </span>
        </button>
        {aside && <div className="shrink-0 text-xs text-muted-foreground">{aside}</div>}
      </div>
      <div id={panelId} hidden={!open} className="mt-3">
        {open && children}
      </div>
    </section>
  );
}
