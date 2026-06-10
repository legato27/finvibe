"use client";

/**
 * OptionsChainTab — the per-stock options view on REAL Polygon chain data
 * (15-min delayed): strike ladder with market greeks/OI/volume, IV term
 * structure with real-straddle expected moves, OI ladder, IV rank vs the
 * stock's own history, PCR / max pain / skew.
 *
 * Replaces the model-estimate presentation (OptionsStrategyRecommendation).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { optionsApi } from "@/lib/api";
import GuideCard from "@/components/ui/GuideCard";
import Sparkline from "@/components/ui/Sparkline";
import StatChip from "@/components/ui/StatChip";

const STALE = 15 * 60 * 1000; // matches the backend chain-cache TTL

type ChainSide = {
  contract?: string; bid?: number | null; ask?: number | null; last?: number | null;
  close?: number | null; iv?: number | null; delta?: number | null; gamma?: number | null;
  theta?: number | null; vega?: number | null; oi?: number | null; volume?: number | null;
};
type ChainRow = { strike: number; call?: ChainSide; put?: ChainSide };

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null ? "—" : v.toFixed(digits);
}

function px(side?: ChainSide): string {
  if (!side) return "—";
  if (side.bid != null && side.ask != null) return `${side.bid.toFixed(2)}/${side.ask.toFixed(2)}`;
  return fmt(side.last ?? side.close);
}

function SideCells({ side, maxOi }: { side?: ChainSide; maxOi: number }) {
  return (
    <>
      <td className="nums px-2 py-1.5 text-right font-mono">{px(side)}</td>
      <td className="nums px-2 py-1.5 text-right font-mono">
        {side?.iv != null ? `${(side.iv * 100).toFixed(1)}%` : "—"}
      </td>
      <td className="nums hidden px-2 py-1.5 text-right font-mono md:table-cell">
        {fmt(side?.delta)}
      </td>
      <td className="nums hidden px-2 py-1.5 text-right font-mono lg:table-cell">
        {fmt(side?.theta, 3)}
      </td>
      <td className="nums px-2 py-1.5 text-right font-mono">
        <span className="relative inline-block min-w-[3.5rem]">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 right-0 rounded-sm bg-primary/15"
            style={{ width: `${maxOi > 0 ? Math.min(100, ((side?.oi ?? 0) / maxOi) * 100) : 0}%` }}
          />
          <span className="relative">{side?.oi?.toLocaleString() ?? "—"}</span>
        </span>
      </td>
      <td className="nums hidden px-2 py-1.5 text-right font-mono sm:table-cell">
        {side?.volume?.toLocaleString() ?? "—"}
      </td>
    </>
  );
}

export default function OptionsChainTab({ ticker }: { ticker: string }) {
  const t = useTranslations("optionsChain");
  const tg = useTranslations("optionsGuide");
  const [expiry, setExpiry] = useState<string | undefined>(undefined);

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useQuery({
    queryKey: ["options-summary", ticker],
    queryFn: () => optionsApi.summary(ticker),
    staleTime: STALE,
    retry: 1,
  });
  const { data: chain, isLoading: chainLoading } = useQuery({
    queryKey: ["options-chain", ticker, expiry ?? "auto"],
    queryFn: () => optionsApi.chain(ticker, expiry),
    staleTime: STALE,
    retry: 1,
  });

  const maxOi = useMemo(() => {
    const rows: ChainRow[] = chain?.rows ?? [];
    return Math.max(0, ...rows.flatMap((r) => [r.call?.oi ?? 0, r.put?.oi ?? 0]));
  }, [chain]);

  if (summaryError) {
    return (
      <div className="card p-8 text-center text-sm text-muted-foreground">
        {t("noChain", { ticker })}
      </div>
    );
  }
  if (summaryLoading || chainLoading) {
    return (
      <div className="card p-8 text-center text-sm text-muted-foreground" role="status">
        {t("loading")}
      </div>
    );
  }

  const term: Array<Record<string, number | string | null>> = summary?.term_structure ?? [];
  const ivr = summary?.iv_rank;
  const spot: number = chain?.spot ?? summary?.spot ?? 0;
  const rows: ChainRow[] = chain?.rows ?? [];

  return (
    <div className="space-y-4">
      <GuideCard
        title={tg("chainTitle")}
        intro={tg("chainIntro")}
        sections={[
          {
            title: tg("chainDirTitle"),
            steps: ["s1", "s2", "s3"].map((k) => tg(`chainDirSteps.${k}`)),
          },
          {
            title: tg("chainStrikeTitle"),
            steps: ["s1", "s2", "s3", "s4", "s5"].map((k) => tg(`chainStrikeSteps.${k}`)),
          },
        ]}
      />

      {/* ── Summary strip ── */}
      <section aria-label={t("summaryTitle")} className="card">
        <div className="flex flex-wrap items-center gap-2">
          {ivr && (
            <>
              <StatChip
                label={t("ivRank")}
                value={ivr.iv_rank}
                tone={ivr.iv_rank >= 70 ? "caution" : ivr.iv_rank >= 40 ? "neutral" : "long"}
              />
              <Sparkline
                values={summary?.iv_rank?.history?.map((h: { iv_pct: number }) => h.iv_pct) ?? []}
                title={t("ivHistoryTitle")}
                className="text-muted-foreground"
              />
            </>
          )}
          <StatChip label={t("atmIv")} value={summary?.atm_iv_30d_pct != null ? `${summary.atm_iv_30d_pct}%` : "—"} />
          <StatChip
            label={t("expectedMove")}
            value={summary?.expected_move_30d_pct != null ? `±${summary.expected_move_30d_pct}%` : "—"}
          />
          <StatChip
            label={t("pcr")}
            value={fmt(summary?.pcr_oi)}
            tone={summary?.pcr_oi > 1.2 ? "short" : summary?.pcr_oi < 0.7 ? "long" : "plain"}
          />
          <StatChip label={t("maxPain")} value={fmt(summary?.max_pain_near)} />
          {summary?.skew_25d && (
            <StatChip label={t("skew")} value={`${summary.skew_25d.skew_pp > 0 ? "+" : ""}${summary.skew_25d.skew_pp}pp`} />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("delayedNote")}
          {chain?.fetched_at ? ` · ${new Date(chain.fetched_at).toLocaleTimeString()}` : ""}
        </p>
      </section>

      {/* ── IV term structure ── */}
      {term.length > 1 && (
        <section aria-label={t("termTitle")} className="card">
          <h3 className="card-title mb-2">{t("termTitle")}</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={term} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
                <XAxis dataKey="dte" tick={{ fontSize: 12 }} unit="d" />
                <YAxis tick={{ fontSize: 12 }} unit="%" domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, t("atmIv")]}
                  labelFormatter={(d) => `${d} DTE`}
                />
                <Line type="monotone" dataKey="atm_iv_pct" stroke="hsl(var(--primary))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {term.slice(0, 6).map((e) => (
              <li key={String(e.expiry)} className="nums">
                {String(e.expiry).slice(5)} ({e.dte}d): ±{e.expected_move_pct ?? "—"}%
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Expiry selector + chain ladder ── */}
      <section aria-label={t("chainTitle")} className="card">
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("expirySelector")}>
          {(chain?.available_expiries ?? []).slice(0, 10).map((e: string) => (
            <button
              key={e}
              type="button"
              aria-pressed={e === chain?.expiry}
              onClick={() => setExpiry(e)}
              className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                e === chain?.expiry
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {e.slice(5)}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground nums">
            {chain?.expiry} · {chain?.dte} DTE · {t("spot")} {spot ? spot.toFixed(2) : "—"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t("chainCaption", { ticker })}</caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="colgroup" colSpan={6} className="px-2 py-1.5 text-center font-semibold text-signal-long">
                  {t("calls")}
                </th>
                <th scope="col" className="px-2 py-1.5 text-center font-semibold">{t("strike")}</th>
                <th scope="colgroup" colSpan={6} className="px-2 py-1.5 text-center font-semibold text-signal-short">
                  {t("puts")}
                </th>
              </tr>
              <tr className="border-b border-border text-[12px] uppercase text-muted-foreground">
                {["bidAsk", "iv", "delta", "theta", "oi", "vol"].map((h) => (
                  <th key={`c-${h}`} scope="col"
                      className={`px-2 py-1 text-right font-medium ${h === "delta" ? "hidden md:table-cell" : ""} ${h === "theta" ? "hidden lg:table-cell" : ""} ${h === "vol" ? "hidden sm:table-cell" : ""}`}>
                    {t(`col.${h}`)}
                  </th>
                ))}
                <th scope="col" className="px-2 py-1 text-center font-medium" />
                {["bidAsk", "iv", "delta", "theta", "oi", "vol"].map((h) => (
                  <th key={`p-${h}`} scope="col"
                      className={`px-2 py-1 text-right font-medium ${h === "delta" ? "hidden md:table-cell" : ""} ${h === "theta" ? "hidden lg:table-cell" : ""} ${h === "vol" ? "hidden sm:table-cell" : ""}`}>
                    {t(`col.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prevBelow = i > 0 && rows[i - 1].strike < spot;
                const crossesSpot = prevBelow && r.strike >= spot;
                const atm = Math.abs(r.strike - spot) === Math.min(...rows.map((x) => Math.abs(x.strike - spot)));
                return (
                  <tr
                    key={r.strike}
                    className={`border-b border-border/50 last:border-0 ${atm ? "bg-primary/5" : ""} ${
                      crossesSpot ? "border-t-2 border-t-primary/50" : ""
                    }`}
                  >
                    <SideCells side={r.call} maxOi={maxOi} />
                    <td className={`nums px-2 py-1.5 text-center font-mono font-semibold ${atm ? "text-primary" : ""}`}>
                      {r.strike}
                    </td>
                    <SideCells side={r.put} maxOi={maxOi} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── OI ladder + unusual OI ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label={t("oiLadderTitle")} className="card">
          <h3 className="card-title mb-2">{t("oiLadderTitle")}</h3>
          <ul className="space-y-1">
            {(summary?.oi_ladder ?? []).slice(0, 10).map(
              (w: { strike: number; call_oi: number; put_oi: number; total_oi: number; vs_spot_pct: number | null }) => {
                const top = summary.oi_ladder[0]?.total_oi || 1;
                return (
                  <li key={w.strike} className="flex items-center gap-2 text-xs">
                    <span className="nums w-14 shrink-0 text-right font-mono font-semibold">{w.strike}</span>
                    <span className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-muted">
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-signal-long/60"
                            style={{ width: `${(w.call_oi / top) * 100}%` }} />
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-signal-short/60"
                            style={{ left: `${(w.call_oi / top) * 100}%`, width: `${(w.put_oi / top) * 100}%` }} />
                    </span>
                    <span className="nums w-20 shrink-0 text-right font-mono text-muted-foreground">
                      {w.total_oi.toLocaleString()}
                    </span>
                    <span className="nums hidden w-14 shrink-0 text-right font-mono text-muted-foreground sm:inline">
                      {w.vs_spot_pct != null ? `${w.vs_spot_pct > 0 ? "+" : ""}${w.vs_spot_pct}%` : ""}
                    </span>
                  </li>
                );
              },
            )}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="mr-3 inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm bg-signal-long/60" /> {t("calls")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm bg-signal-short/60" /> {t("puts")}
            </span>
          </p>
        </section>

        <section aria-label={t("unusualTitle")} className="card">
          <h3 className="card-title mb-2">{t("unusualTitle")}</h3>
          {(summary?.unusual_oi ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUnusual")}</p>
          ) : (
            <ul className="space-y-1.5">
              {summary.unusual_oi.map(
                (u: { contract: string; type: string; strike: number; expiry: string; oi: number; z: number; vs_spot_pct: number | null }) => (
                  <li key={u.contract} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className={`font-medium ${u.type === "call" ? "text-signal-long" : "text-signal-short"}`}>
                        {u.type === "call" ? t("callLabel") : t("putLabel")}
                      </span>{" "}
                      <span className="nums font-mono">{u.strike}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{u.expiry.slice(5)}</span>
                    </span>
                    <span className="nums font-mono text-xs text-muted-foreground">
                      OI {u.oi.toLocaleString()} · z={u.z}
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
