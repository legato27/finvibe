"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { macroApi } from "@/lib/api";

/**
 * Market-level agreement indicator. The dashboard shows several independent
 * regime signals (VIX zone, business cycle, swarm, and the synthesized
 * "today" regime) that can openly contradict — e.g. a green "Risk-On" header
 * above a red "Contraction" cycle wheel. This chip normalizes each to
 * risk-on / neutral / risk-off and surfaces whether they actually agree,
 * the market-level analog of the per-ticker conflict list.
 *
 * Reads the same ["macro_dashboard"] query as DashboardView (shared cache, no
 * extra fetch).
 */
type Lean = "on" | "off" | "neutral";

function vixLean(zone?: string): Lean | null {
  if (!zone) return null;
  if (zone === "COMPLACENCY" || zone === "LOW_VOLATILITY") return "on";
  if (zone === "NORMAL") return "neutral";
  if (zone === "ELEVATED" || zone === "EXTREME_FEAR") return "off";
  return null;
}
function cycleLean(state?: string): Lean | null {
  if (!state) return null;
  if (state === "Expansion") return "on";
  if (state === "Contraction") return "off";
  if (state === "Peak" || state === "Trough") return "neutral";
  return null;
}
function swarmLean(type?: string): Lean | null {
  if (!type) return null;
  if (type === "White") return "on";
  if (type === "Black") return "off";
  return "neutral"; // Gray / Neutral
}
function regimeColorLean(color?: string): Lean | null {
  if (!color) return null;
  if (color === "green") return "on";
  if (color === "yellow") return "neutral";
  if (color === "orange" || color === "red") return "off";
  return null;
}

const LEAN_DOT: Record<Lean, string> = {
  on: "bg-signal-long",
  off: "bg-signal-short",
  neutral: "bg-signal-neutral",
};
const LEAN_TEXT: Record<Lean, string> = {
  on: "text-signal-long",
  off: "text-signal-short",
  neutral: "text-signal-neutral",
};

export function RegimeAgreement() {
  const t = useTranslations("dashboard");
  const { data } = useQuery({ queryKey: ["macro_dashboard"], queryFn: macroApi.dashboard, staleTime: 50 * 1000 });
  if (!data) return null;

  const rows: { label: string; lean: Lean }[] = [
    { label: t("regimeSignalToday"), lean: regimeColorLean(data.today?.regime_color) },
    { label: t("regimeSignalVix"), lean: vixLean(data.vix?.zone) },
    { label: t("regimeSignalSwarm"), lean: swarmLean(data.swarm?.signal_type) },
    { label: t("regimeSignalCycle"), lean: cycleLean(data.business_cycle?.state) },
  ].filter((r): r is { label: string; lean: Lean } => r.lean !== null);

  if (rows.length === 0) return null;

  const on = rows.filter((r) => r.lean === "on").length;
  const off = rows.filter((r) => r.lean === "off").length;

  // Headline: conflicting when both directions present; otherwise the dominant lean.
  let headline: string;
  let headlineTone: Lean;
  if (on > 0 && off > 0) {
    headline = t("regimeConflicting");
    headlineTone = "neutral";
  } else if (on > 0) {
    headline = t("regimeAlignedRiskOn");
    headlineTone = "on";
  } else if (off > 0) {
    headline = t("regimeAlignedRiskOff");
    headlineTone = "off";
  } else {
    headline = t("regimeMixed");
    headlineTone = "neutral";
  }

  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("regimeAgreementTitle")}</span>
      <span className={`text-xs font-semibold ${LEAN_TEXT[headlineTone]}`}>
        {headline} · {t("regimeAgreeCount", { agree: on > off ? on : off, total: rows.length })}
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto">
        {rows.map((r) => (
          <span key={r.label} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full ${LEAN_DOT[r.lean]}`} aria-hidden />
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
