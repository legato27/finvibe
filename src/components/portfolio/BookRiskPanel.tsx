"use client";

/**
 * BookRiskPanel — how many bets this book really holds.
 *
 * Answer first: one sentence with the effective number of bets, the largest
 * bet and who is in it, then four Stats and one Chip per bet. The evidence
 * (the bet table, the correlation matrix, the factor tilt) sits under a
 * Disclosure that a deep link `#book-risk` opens. Percentages and counts
 * only, so the balances toggle has nothing to hide here.
 *
 * `BookRiskView` is the presentational half and takes the hook's state as a
 * prop, so it can be mounted on fixture data for a headless check.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat, { type StatTone } from "@/components/ui/Stat";
import Segmented from "@/components/ui/Segmented";
import Disclosure from "@/components/ui/Disclosure";
import Chip from "@/components/ui/Chip";
import DataTable, { type Column } from "@/components/ui/DataTable";
import CorrelationMatrix from "@/components/portfolio/CorrelationMatrix";
import { useBookRisk, type BookRiskState, type BookScope } from "@/lib/useBookRisk";
import type { Cluster } from "@/lib/bookRisk";

const FACTOR_ORDER = ["momentum", "ensemble", "quality", "value", "moat", "low_vol"];
const MATRIX_MAX = 20;
const CHIP_MAX = 8;

export function BookRiskPanel({
  portfolioId,
  portfolioCount,
}: {
  portfolioId: number | null;
  portfolioCount: number;
}) {
  const t = useTranslations("portfolio.bookRisk");
  const [scopeKind, setScopeKind] = useState<"this" | "all">("this");
  const scope: BookScope = scopeKind === "all" ? { kind: "all" } : { kind: "portfolio", id: portfolioId };
  const state = useBookRisk(scope);
  const aside =
    portfolioCount > 1 ? (
      <Segmented
        mode="toggle"
        size="sm"
        ariaLabel={t("scopeLabel")}
        value={scopeKind}
        onChange={setScopeKind}
        options={[
          { value: "this", label: t("scopeThis") },
          { value: "all", label: t("scopeAll") },
        ]}
      />
    ) : undefined;
  return <BookRiskView state={state} aside={aside} />;
}

export function BookRiskView({ state, aside }: { state: BookRiskState; aside?: ReactNode }) {
  const t = useTranslations("portfolio.bookRisk");
  const label = t("label");

  // A deep link (#book-risk, from the Today call) lands on the evidence open.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state.status !== "ready") return;
    if (typeof window === "undefined" || window.location.hash !== "#book-risk") return;
    setOpen(true);
    document.getElementById("book-risk")?.scrollIntoView({ block: "start" });
  }, [state.status]);

  const risk = state.risk;
  const columns = useMemo<Column<Cluster>[]>(
    () => [
      { key: "bet", header: t("col.bet"), cell: (c) => <span className="font-mono text-muted-foreground">{c.id + 1}</span> },
      {
        key: "names",
        header: t("col.names"),
        cell: (c) => <span className="font-mono text-foreground">{c.members.join("  ")}</span>,
        className: "max-w-0 truncate",
      },
      {
        key: "weight",
        header: t("col.weight"),
        sortable: true,
        sortValue: (c) => c.weight,
        align: "right",
        cell: (c) => <span className="nums font-mono">{(c.weight * 100).toFixed(1)}%</span>,
      },
      {
        key: "corr",
        header: t("col.corr"),
        sortable: true,
        sortValue: (c) => c.avgCorr,
        align: "right",
        cell: (c) => <span className="nums font-mono">{c.avgCorr == null ? "—" : c.avgCorr.toFixed(2)}</span>,
      },
      {
        key: "beta",
        header: t("col.beta"),
        sortable: true,
        sortValue: (c) => c.beta,
        align: "right",
        hideBelow: "sm",
        cell: (c) => <span className="nums font-mono">{c.beta == null ? "—" : c.beta.toFixed(2)}</span>,
      },
    ],
    [t],
  );

  if (state.status === "pending") return <PanelPending label={label} text={t("pending")} />;
  if (state.status === "empty" || !risk) {
    return (
      <PanelUnavailable
        label={label}
        aside={aside}
        reason={state.names === 0 ? t("needHoldings") : t("needTwo")}
      />
    );
  }

  const bets = risk.effectiveBets;
  const largest = risk.largest;
  const pct = largest ? Math.round(largest.weight * 100) : 0;
  const independent = bets >= risk.names * 0.85;
  const members = largest ? memberList(largest.members, t) : "";
  const lead = independent
    ? t("leadIndependent", { names: risk.names, pct, members })
    : t("lead", { bets: fmtBets(bets), names: risk.names, pct, members });

  const betaMeasured = Object.keys(risk.betas).length;
  const matrixTickers = [...risk.included].sort((a, b) => risk.weights[b] - risk.weights[a]).slice(0, MATRIX_MAX);
  const matrixIndex = matrixTickers.map((tk) => risk.included.indexOf(tk));
  const matrixCorr = matrixIndex.map((i) => matrixIndex.map((j) => risk.corr[i][j]));

  const tilt = [...risk.tilt].sort((a, b) => FACTOR_ORDER.indexOf(a.factor) - FACTOR_ORDER.indexOf(b.factor));
  const tiltHi = tilt.length ? tilt.reduce((m, x) => (x.value > m.value ? x : m)) : null;
  const tiltLo = tilt.length ? tilt.reduce((m, x) => (x.value < m.value ? x : m)) : null;

  const notes: string[] = [
    t("reading", { threshold: risk.threshold.toFixed(1), days: risk.window.days, ccy: state.currency }),
  ];
  if (state.unconverted > 0) notes.push(t("unconverted", { count: state.unconverted, ccy: state.currency }));
  if (state.historyErrors.length > 0) notes.push(t("historyErrors", { count: state.historyErrors.length }));

  return (
    <>
      <Panel
        label={label}
        qualifier={t("qualifier", { names: risk.names, days: risk.window.days })}
        aside={aside}
        reading={notes.join(" ")}
      >
        <p className="text-[15px] leading-relaxed text-foreground">{lead}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("stat.bets")} value={fmtBets(bets)} sub={t("stat.betsSub", { names: risk.names })} />
          <Stat
            label={t("stat.largest")}
            value={`${pct}%`}
            sub={largest && largest.members.length > 1 ? t("stat.largestMany", { count: largest.members.length }) : t("stat.largestOne")}
            tone={pct >= 50 ? "caution" : "plain"}
          />
          <Stat
            label={t("stat.beta")}
            value={risk.bookBeta == null ? "—" : risk.bookBeta.toFixed(2)}
            sub={risk.bookBeta == null ? t("stat.betaNone") : t("stat.betaSub", { count: betaMeasured, names: risk.names })}
            tone={risk.bookBeta == null ? "muted" : "plain"}
          />
          <Stat
            label={t("stat.excluded")}
            value={risk.excluded.length}
            sub={risk.excluded.length ? risk.excluded.map((e) => e.ticker).join(" ") : t("stat.excludedNone")}
            tone={risk.excluded.length ? "plain" : "muted"}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5" aria-label={t("tableCaption")}>
          {risk.clusters.slice(0, CHIP_MAX).map((c) => (
            <Chip key={c.id} tone={c.id === 0 ? "signal" : "plain"}>
              <span className="font-mono">
                {c.members[0]}
                {c.members.length > 1 && <span className="opacity-70"> +{c.members.length - 1}</span>}
                <span className="opacity-70"> · {(c.weight * 100).toFixed(0)}%</span>
              </span>
            </Chip>
          ))}
          {risk.clusters.length > CHIP_MAX && (
            <Chip tone="plain">{t("moreBets", { count: risk.clusters.length - CHIP_MAX })}</Chip>
          )}
        </div>
      </Panel>

      <Disclosure
        id="book-risk"
        label={t("detailLabel")}
        qualifier={t("detailQualifier", { threshold: risk.threshold.toFixed(1) })}
        open={open}
      >
        <div className="space-y-6">
          <DataTable
            caption={t("tableCaption")}
            columns={columns}
            rows={risk.clusters}
            rowKey={(c) => String(c.id)}
            defaultSort={{ key: "weight", dir: "desc" }}
            countLabel={(n) => t("countLabel", { count: n })}
          />

          <section>
            <div className="card-title mb-2">{t("matrixLabel")}</div>
            {matrixTickers.length >= 2 ? (
              <>
                <CorrelationMatrix
                  tickers={matrixTickers}
                  corr={matrixCorr}
                  ariaLabel={t("matrixAria", { count: matrixTickers.length })}
                />
                {risk.included.length > MATRIX_MAX && (
                  <p className="mt-2 text-xs text-muted-foreground">{t("matrixTruncated", { count: MATRIX_MAX })}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noMatrix")}</p>
            )}
          </section>

          <section>
            <div className="card-title mb-2">{t("tiltLabel")}</div>
            {tilt.length ? (
              <>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {tilt.map((f) => (
                    <Stat
                      key={f.factor}
                      size="sm"
                      label={t(`factor.${f.factor}` as never) || f.factor}
                      value={fmtZ(f.value)}
                      tone={toneForZ(f.value)}
                    />
                  ))}
                </div>
                <p className="card-reading">
                  {tiltHi && tiltLo && tiltHi !== tiltLo
                    ? t("tiltReading", { hi: factorName(tiltHi.factor, t), lo: factorName(tiltLo.factor, t) }) + " "
                    : ""}
                  {t("tiltSub", { pct: Math.round(risk.tiltCoverage * 100) })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("tiltNone")}</p>
            )}
          </section>
        </div>
      </Disclosure>
    </>
  );
}

type T = ReturnType<typeof useTranslations<"portfolio.bookRisk">>;

function memberList(members: string[], t: T): string {
  const head = members.slice(0, 3).join(", ");
  return members.length > 3 ? `${head} ${t("moreMembers", { count: members.length - 3 })}` : head;
}

function factorName(key: string, t: T): string {
  return FACTOR_ORDER.includes(key) ? t(`factor.${key}` as never) : key;
}

export function fmtBets(n: number): string {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

function fmtZ(z: number): string {
  return `${z > 0 ? "+" : z < 0 ? "−" : ""}${Math.abs(z).toFixed(1)}`;
}

function toneForZ(z: number): StatTone {
  if (z >= 0.5) return "long";
  if (z <= -0.5) return "short";
  return "plain";
}
