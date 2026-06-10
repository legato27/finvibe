"use client";

/**
 * LivePrice — price display with polite, debounced screen-reader announcements.
 * Replaces the bare pulsing-dot pattern (which was invisible to AT).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export default function LivePrice({
  price,
  currency = "",
  live = false,
  className = "",
}: {
  price: number | null | undefined;
  currency?: string;
  live?: boolean;
  className?: string;
}) {
  const t = useTranslations("a11y");
  const [announced, setAnnounced] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce announcements to at most one per 30s — aria-live on every tick
  // would make the page unusable with a screen reader.
  useEffect(() => {
    if (price == null || !live) return;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      setAnnounced(`${currency}${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
      timer.current = null;
    }, 30000);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [price, live, currency]);

  return (
    <span className={`nums font-mono ${className}`}>
      {price == null ? "—" : `${currency}${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
      {live && (
        <>
          <span
            aria-hidden="true"
            className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-signal-long align-middle motion-safe:animate-pulse"
          />
          <span className="sr-only">{t("livePrice")}</span>
          <span aria-live="polite" className="sr-only">
            {announced}
          </span>
        </>
      )}
    </span>
  );
}
