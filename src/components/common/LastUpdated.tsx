"use client";

import Freshness from "@/components/ui/Freshness";

// Kept as a thin alias so existing call sites keep working; new code uses
// <Freshness at=… /> directly. Renders nothing until a valid timestamp exists.
export function LastUpdated({
  at,
  label,
  className = "",
}: {
  at?: string | null;
  label?: string;
  className?: string;
}) {
  if (!at || Number.isNaN(new Date(at).getTime())) return null;
  return <Freshness at={at} label={label?.toLowerCase()} className={className} />;
}
