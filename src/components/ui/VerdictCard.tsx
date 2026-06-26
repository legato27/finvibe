"use client";

/**
 * VerdictCard — the stock page hero. IA: verdict → why (evidence rows with
 * agree/disagree/stale marks) → levels → details on demand.
 *
 * Conflict state is first-class: violet, names the two opposed sources, and
 * surfaces the LLM arbitration explanation when present.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import VerdictBadge, { SourceEvidence, VerdictJson } from "./VerdictBadge";
import { NEUTRAL_BAND } from "@/lib/signals";

const SOURCE_ORDER = ["ensemble", "pam", "ranked", "sentiment", "llm"] as const;

function fmtPrice(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function sourceLine(name: string, s: SourceEvidence): string {
  switch (name) {
    case "ensemble": {
      const ret = s["return_3m_pct"];
      return ret != null ? `${s["signal"] ?? ""} ${Number(ret) > 0 ? "+" : ""}${ret}% (3M)` : String(s["signal"] ?? "");
    }
    case "pam": {
      const hr = s["measured_hit_rate"];
      const base = `${s["setup"] ?? ""} · ${s["status"] ?? ""}`;
      return hr != null ? `${base} · ${(Number(hr) * 100).toFixed(0)}% measured` : base;
    }
    case "ranked":
      return s["percentile"] != null ? `${s["bucket"] ?? ""} · P${Math.round(Number(s["percentile"]))}` : String(s["bucket"] ?? "");
    case "sentiment":
      return s["news_score"] != null ? `${Number(s["news_score"]) >= 0 ? "+" : ""}${Number(s["news_score"]).toFixed(2)} · ${s["articles"]} articles` : "";
    case "llm":
      return `${s["verdict"] ?? ""}${s["conviction"] ? ` (${s["conviction"]})` : ""}`;
    default:
      return "";
  }
}

function AgreeMark({ s, score }: { s: SourceEvidence; score: number }) {
  const t = useTranslations("verdict");
  if (!s.available) {
    return (
      <span className="text-muted-foreground" title={t("stale")}>
        <span aria-hidden="true">◌</span>
        <span className="sr-only">{t("stale")}</span>
      </span>
    );
  }
  // A near-zero direction is a neutral stance — show it as such, not as
  // agreement (a NEUTRAL ensemble doesn't "agree" with a LONG verdict).
  if (Math.abs(s.direction ?? 0) < NEUTRAL_BAND.verdictDirection) {
    return (
      <span className="text-signal-neutral" title={t("neutralStance")}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{t("neutralStance")}</span>
      </span>
    );
  }
  const agrees = (s.direction ?? 0) * score >= 0;
  return agrees ? (
    <span className="text-signal-long" title={t("agrees")}>
      <span aria-hidden="true">✓</span>
      <span className="sr-only">{t("agrees")}</span>
    </span>
  ) : (
    <span className="text-signal-short" title={t("disagrees")}>
      <span aria-hidden="true">✗</span>
      <span className="sr-only">{t("disagrees")}</span>
    </span>
  );
}

export default function VerdictCard({ verdict }: { verdict: VerdictJson | null | undefined }) {
  const t = useTranslations("verdict");
  const [open, setOpen] = useState(false);
  if (!verdict?.state) {
    return (
      <section aria-label={t("title")} className="card">
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      </section>
    );
  }
  const v = verdict;
  const confidencePct = Math.round((v.confidence ?? 0) * 100);
  const isConflict = v.state === "CONFLICTING";
  const sources = v.sources ?? {};

  return (
    <section aria-label={t("title")} className="card">
      {/* ── Verdict headline ── */}
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge state={v.state} size="lg" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="nums">
            {t("confidence")}: {confidencePct}%
          </span>
          {!v.confidence_calibrated && (
            <span className="rounded border border-signal-caution/40 bg-signal-caution-bg px-1.5 py-0.5 text-xs text-signal-caution">
              {t("provisional")}
            </span>
          )}
        </div>
      </div>

      {/* Confidence bar */}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={confidencePct}
        aria-label={t("confidence")}
        className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted"
      >
        <div
          className={`h-full rounded ${isConflict ? "bg-signal-conflict" : "bg-primary"}`}
          style={{ width: `${confidencePct}%` }}
        />
      </div>

      {/* ── Conflict callout ── */}
      {isConflict && (
        <div className="mt-3 rounded-lg border border-signal-conflict/40 bg-signal-conflict-bg p-3 text-sm">
          <p className="font-medium text-signal-conflict">
            {t("conflictHeadline", {
              a: t(`source.${v.conflict?.between?.[0] ?? "ensemble"}`),
              b: t(`source.${v.conflict?.between?.[1] ?? "pam"}`),
            })}
          </p>
          {v.conflict?.explanation && (
            <p className="mt-1 text-foreground">{v.conflict.explanation}</p>
          )}
        </div>
      )}

      {/* ── Vetoes ── */}
      {(v.vetoes?.length ?? 0) > 0 && (
        <p className="mt-2 text-xs text-signal-caution">
          {v.vetoes!.map((veto) => t(`veto.${veto}`)).join(" · ")}
        </p>
      )}

      {/* ── Evidence rows ── */}
      <h3 className="card-title mt-4">{t("why")}</h3>
      <ul className="mt-2 space-y-1.5">
        {SOURCE_ORDER.map((name) => {
          const s = sources[name];
          if (!s) return null;
          return (
            <li key={name} className="flex items-center gap-2 text-sm">
              <AgreeMark s={s} score={v.score ?? 0} />
              <span className="w-24 shrink-0 text-muted-foreground">{t(`source.${name}`)}</span>
              <span className={s.available ? "text-foreground" : "text-muted-foreground"}>
                {s.available ? sourceLine(name, s) : t("unavailable")}
              </span>
              {name === "llm" && Boolean(s["echo_discounted"]) && (
                <span
                  title={t("echoDiscounted")}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {t("echoShort")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Levels strip ── */}
      {v.levels && (v.levels.invalidation != null || v.levels.target != null) && (
        <>
          <h3 className="card-title mt-4">{t("levels")}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t("entryZone")}</dt>
              <dd className="nums font-mono">
                {v.levels.sweet_spot
                  ? `${fmtPrice(v.levels.sweet_spot.low)}–${fmtPrice(v.levels.sweet_spot.high)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("invalidation")}</dt>
              <dd className="nums font-mono text-signal-short">{fmtPrice(v.levels.invalidation)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("target")}</dt>
              <dd className="nums font-mono text-signal-long">{fmtPrice(v.levels.target)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("lastClose")}</dt>
              <dd className="nums font-mono">{fmtPrice(v.levels.last_close)}</dd>
            </div>
          </dl>
        </>
      )}

      {/* ── Details on demand ── */}
      <button
        type="button"
        className="mt-3 text-xs text-primary underline-offset-2 hover:underline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? t("hideDetails") : t("showDetails")}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <div>
            <dt>{t("score")}</dt>
            <dd className="nums font-mono text-foreground">{v.score?.toFixed(2) ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("agreement")}</dt>
            <dd className="nums font-mono text-foreground">{v.agreement?.toFixed(2) ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("sourcesUsed")}</dt>
            <dd className="nums font-mono text-foreground">{v.n_sources ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("computedAt")}</dt>
            <dd className="font-mono text-foreground">
              {v.computed_at ? new Date(v.computed_at).toLocaleDateString() : "—"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
