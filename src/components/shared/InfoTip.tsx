"use client";
import { useState, useRef, useEffect } from "react";
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
        className={`text-slate-600 hover:text-slate-400 transition-colors cursor-help ${className}`}
        aria-label="More info"
      >
        {label && <span className="text-[10px] mr-0.5">{label}</span>}
        <HelpCircle style={{ width: size, height: size }} className="inline" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 sm:w-72">
          <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 text-xs text-slate-300 leading-relaxed">
            {tip}
          </div>
          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-slate-800 border-b border-r border-slate-700 rotate-45 -mt-1" />
          </div>
        </div>
      )}
    </div>
  );
}
