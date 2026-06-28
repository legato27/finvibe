"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle } from "lucide-react";

interface InfoTipProps {
  /** Short label next to the icon (optional) */
  label?: string;
  /** The tooltip explanation text */
  tip: string;
  /** Size of the icon */
  size?: number;
  /** Extra class on the icon */
  className?: string;
}

/**
 * Inline help icon with hover/click tooltip.
 * Shows a floating card explaining what the data point means.
 */
export function InfoTip({ label, tip, size = 13, className = "" }: InfoTipProps) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`text-muted-foreground hover:text-muted-foreground transition-colors cursor-help ${className}`}
        aria-label={t("moreInfo")}
      >
        {label && <span className="text-[10px] mr-0.5">{label}</span>}
        <HelpCircle style={{ width: size, height: size }} className="inline" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 sm:w-72">
          <div className="bg-muted border border-border rounded-lg shadow-xl p-3 text-xs text-foreground leading-relaxed">
            {tip}
          </div>
          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-muted border-b border-r border-border rotate-45 -mt-1" />
          </div>
        </div>
      )}
    </div>
  );
}
