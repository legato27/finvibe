"use client";

/**
 * TodayCall — the answer at the top of the Today page.
 *
 * A lean, one paragraph, the risk score, the top signal and what fired,
 * built from data the page already fetches (the shared ["macro_dashboard"]
 * query and the signals digest). Everything below it on the page is
 * evidence for this strip. It never returns null: while loading it keeps
 * its shape, and when the regime feed fails it says so in the same place.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { macroApi, stocksApi } from "@/lib/api";
import { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Freshness from "@/components/ui/Freshness";
import { InfoTip } from "@/components/shared/InfoTip";
import {
  agreement, cycleLean, regimeColorLean, swarmLean, vixLean,
  LEAN_DOT, LEAN_TEXT, type Lean, type LeanRow,
} from "@/lib/lean";

const LEAN_PILL: Record<Lean, string> = {
  on: "bg-primary text-primary-foreground",
  neutral: "bg-signal-caution-bg text-signal-caution border border-signal-caution/40",
  off: "bg-signal-short-bg text-signal-short border border-signal-short/40",
};

export function TodayCall() {
  const t = useTranslations("dashboard");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["macro_dashboard"],
    queryFn: macroApi.dashboard,
    staleTime: 50 * 1000,
  });
  const { data: digest } = useQuery({
    queryKey: ["signals-today"],
    queryFn: () => stocksApi.signalsToday(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const today = data?.today;
  if (isLoading) return <PanelPending label={t("callLabel")} text={t("buildingTodayView")} />;
  if (isError || !today || today.error) {
    return <PanelUnavailable label={t("callLabel")} reason={t("callUnavailable")} />;
  }

  const lean: Lean = regimeColorLean(today.regime_color) ?? "neutral";
  const score: number = today.risk_score;

  const rows = (
    [
      { label: t("regimeSignalToday"), lean: regimeColorLean(today.regime_color) },
      { label: t("regimeSignalVix"), lean: vixLean(data.vix?.zone) },
      { label: t("regimeSignalSwarm"), lean: swarmLean(data.swarm?.signal_type) },
      { label: t("regimeSignalCycle"), lean: cycleLean(data.business_cycle?.state) },
    ] as { label: string; lean: Lean | null }[]
  ).filter((r): r is LeanRow => r.lean !== null);
  const agg = agreement(rows);

  // The paragraph. Regime and score, then which models lean where, then the
  // one thing to watch. Built from parts so a missing feed drops a clause,
  // not the sentence.
  const list = (l: Lean) => rows.filter((r) => r.lean === l).map((r) => r.label);
  const clauses: string[] = [];
  if (list("on").length) clauses.push(t("callLeanOn", { list: joinNames(list("on")) }));
  if (list("off").length) clauses.push(t("callLeanOff", { list: joinNames(list("off")) }));
  if (list("neutral").length) clauses.push(t("callLeanNeutral", { list: joinNames(list("neutral")) }));
  const signals: { signal: string; impact: string; weight: string }[] = today.signals ?? [];
  const watch =
    signals.find((s) => s.weight === "high") ?? signals.find((s) => s.weight === "medium") ?? signals[0];
  const missing: string[] = Array.isArray(today.inputs_missing) ? today.inputs_missing : [];

  const fired =
    (digest?.new_pam_triggers?.length ?? 0) +
    (digest?.verdict_changes?.length ?? 0) +
    (digest?.conflicts?.length ?? 0);
  const top = [...(digest?.new_pam_triggers ?? [])].sort(
    (a, b) => (b.conviction ?? 0) - (a.conviction ?? 0),
  )[0];

  return (
    <section
      aria-label={t("callLabel")}
      className={`card grid gap-4 border-signal/40 bg-signal-bg p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start`}
    >
      {/* Lean */}
      <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
        <span className={`inline-flex rounded-control px-3 py-1.5 text-base font-black tracking-tight ${LEAN_PILL[lean]}`}>
          {t(lean === "on" ? "leanIn" : lean === "off" ? "leanOut" : "leanNeutral")}
        </span>
        <span className="card-title">
          {t("callLabel")} · <span className="normal-case tracking-normal">{today.date}</span>
        </span>
      </div>

      {/* Paragraph */}
      <div className="min-w-0">
        <p className="text-[15px] leading-relaxed text-foreground">
          <b className="font-bold">{today.regime}</b> {t("callAtScore", { score: fmtScore(score) })}{" "}
          {agg.headline === "conflict" ? (
            <span className="text-signal-conflict">{t("regimeConflicting")}: </span>
          ) : (
            <span>{t("regimeAgreeCount", { agree: agg.agree, total: rows.length })}: </span>
          )}
          {clauses.join("; ")}.
          {watch && (
            <>
              {" "}
              <b className="font-bold">{t("callWatch")}</b> {watch.signal}.
            </>
          )}
          {missing.length > 0 && (
            <span className="text-signal-caution"> {t("inputsMissingNote", { count: missing.length })}.</span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {rows.map((r) => (
            <span key={r.label} className={`inline-flex items-center gap-1 font-mono text-[11px] ${LEAN_TEXT[r.lean]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${LEAN_DOT[r.lean]}`} aria-hidden="true" />
              {r.label}
            </span>
          ))}
          <Freshness at={today.generated_at} className="ml-auto" />
        </div>
      </div>

      {/* Figures */}
      <div className="flex gap-6 lg:gap-8">
        <div>
          <div className="stat-label flex items-center gap-1">
            {t("riskScore")} <InfoTip size={10} tip={t("riskScoreTip")} />
          </div>
          <div className={`nums font-mono text-3xl font-bold leading-none ${LEAN_TEXT[lean]}`}>{fmtScore(score)}</div>
        </div>
        <div>
          <div className="stat-label">{t("callTopSignal")}</div>
          {top ? (
            <Link href={`/stock/${top.ticker}`} className="nums font-mono text-3xl font-bold leading-none text-foreground hover:text-signal">
              {top.ticker}
              {top.conviction != null && <span className="ml-1.5 text-base text-muted-foreground">· {Math.round(top.conviction)}</span>}
            </Link>
          ) : (
            <div className="nums font-mono text-3xl font-bold leading-none text-dim">—</div>
          )}
        </div>
        <div>
          <div className="stat-label">{t("callFired")}</div>
          <a href="#signals" className="nums font-mono text-3xl font-bold leading-none text-foreground hover:text-signal">
            {digest ? fired : "—"}
          </a>
        </div>
      </div>
    </section>
  );
}

function fmtScore(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(0)}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
