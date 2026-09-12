"use client";

/**
 * Back link that follows the referrer. If the reader arrived from inside the
 * app the browser's history is the right destination; otherwise (a shared
 * link, a fresh tab) it falls back to the page that most often leads here.
 */
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

export function BackLink({ fallback = "/watchlist", className = "" }: { fallback?: string; className?: string }) {
  const router = useRouter();
  const t = useTranslations("common");
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const internal =
      typeof document !== "undefined" &&
      document.referrer.startsWith(window.location.origin) &&
      window.history.length > 1;
    if (internal) {
      e.preventDefault();
      router.back();
    }
  }
  return (
    <a
      href={fallback}
      onClick={onClick}
      aria-label={t("back")}
      className={`inline-flex items-center gap-1 rounded-md text-muted-foreground transition-colors hover:text-signal ${className}`}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </a>
  );
}
