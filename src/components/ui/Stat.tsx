import { ReactNode } from "react";

/**
 * Stat — label / figure / subline. The portfolio's summary cards, the stock
 * hero row and the desk's headline numbers are all this.
 */
export type StatTone = "plain" | "long" | "short" | "caution" | "muted";

const TONE: Record<StatTone, string> = {
  plain: "text-foreground",
  long: "text-signal-long",
  short: "text-signal-short",
  caution: "text-signal-caution",
  muted: "text-muted-foreground",
};

export default function Stat({
  label,
  value,
  sub,
  tone = "plain",
  size = "md",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const v = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <span className="stat-label">{label}</span>
      <span className={`nums font-mono font-bold tracking-tight ${v} ${TONE[tone]}`}>{value}</span>
      {sub && <span className="nums font-mono text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
