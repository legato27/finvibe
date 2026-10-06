"use client";

/**
 * Desk → Crypto. The Bitcoin market-maker module on the page grammar: the
 * answer first (one sentence, a lean pill, three Stats), then the session
 * clock, the setup, the liquidity map, the chart with the setup's levels,
 * your coins, the funding-carry card, and the backtest under a Disclosure. Every panel keeps its
 * place when its feed is down and says why.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat from "@/components/ui/Stat";
import Segmented from "@/components/ui/Segmented";
import Chip from "@/components/ui/Chip";
import Disclosure from "@/components/ui/Disclosure";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Freshness from "@/components/ui/Freshness";
import { PriceChart } from "@/components/stock/PriceChart";
import { useMyWatchlistTickers, useUser } from "@/lib/supabase/hooks";
import { usePalette } from "@/components/heatmap/palette";
import { cryptoApi, type CarryCard } from "@/modules/crypto/api";
import { isCryptoTicker } from "@/modules/crypto/flag";
import { equityPath, leanFromBias, liquidityRows, sessionLine, setupAsPriceAction, setupLabel, type LiquidityRow } from "@/modules/crypto/lib/desk";

const LEAN_PILL = {
  on: "bg-primary text-primary-foreground",
  neutral: "bg-signal-caution-bg text-signal-caution border border-signal-caution/40",
  off: "bg-signal-short-bg text-signal-short border border-signal-short/40",
} as const;

const usd = (n: number | null | undefined, d = 0) => (n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

export function CryptoDeskPage() {
  const t = useTranslations("crypto");
  const router = useRouter();
  const { data: reading, isLoading: readingLoading, isError: readingError } = useQuery({ queryKey: ["crypto-desk", "reading"], queryFn: () => cryptoApi.reading("4h"), staleTime: 60_000, refetchInterval: 60_000, retry: 1 });
  const { data: liquidity, isLoading: liqLoading } = useQuery({ queryKey: ["crypto-desk", "liquidity"], queryFn: () => cryptoApi.liquidity("4h"), staleTime: 120_000, retry: 1 });
  const { data: backtest } = useQuery({ queryKey: ["crypto-desk", "backtest"], queryFn: () => cryptoApi.backtest("4h"), staleTime: 60 * 60_000, retry: 1 });

  const setup = reading?.setup ?? liquidity?.mm_setup ?? null;
  const lean = leanFromBias(setup?.bias);
  const session = useMemo(() => sessionLine(reading?.session ?? liquidity?.session), [reading?.session, liquidity?.session]);
  const rows = useMemo(() => liquidityRows(liquidity), [liquidity]);
  const chartPa = useMemo(() => setupAsPriceAction(setup), [setup]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="font-mono text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Segmented
          ariaLabel={t("deskSwitch")}
          value="crypto"
          onChange={(v) => { if (v === "scalp") router.push("/desk/scalp"); else if (v === "journal") router.push("/desk/journal"); else if (v !== "crypto") router.push(`/desk?strategy=${v}`); }}
          options={[
            { value: "csp", label: t("switchPuts") },
            { value: "covered_call", label: t("switchCalls") },
            { value: "crypto", label: t("switchCrypto") },
            { value: "scalp", label: t("switchScalp") },
            { value: "journal", label: t("switchJournal") },
          ]}
        />
      </header>

      {/* ── The answer ── */}
      {readingLoading ? (
        <PanelPending label={t("callLabel")} text={t("loading")} />
      ) : readingError || !reading?.available ? (
        <PanelUnavailable label={t("callLabel")} reason={t("unavailable")} />
      ) : (
        <section aria-label={t("callLabel")} className="card grid gap-4 border-signal/40 bg-signal-bg p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
          <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
            <span className={`inline-flex rounded-control px-3 py-1.5 text-base font-black tracking-tight ${LEAN_PILL[lean]}`}>
              {t(lean === "on" ? "leanIn" : lean === "off" ? "leanOut" : "leanNeutral")}
            </span>
            <span className="card-title">{t("callLabel")}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] leading-relaxed text-foreground">{reading.reading}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Chip tone={session.active ? "signal" : "plain"}><span className="font-mono">{session.text}</span></Chip>
              {setup && <Chip tone={lean === "on" ? "signal" : lean === "off" ? "short" : "caution"}><span className="font-mono">{setupLabel(setup.setup_type)}</span></Chip>}
              <Freshness at={reading.as_of} className="ml-auto" />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 lg:gap-8">
            <Stat label={t("stat.price")} value={usd(reading.price?.current_price)} sub={pct(reading.price?.change_24h_pct)} tone={(reading.price?.change_24h_pct ?? 0) >= 0 ? "long" : "short"} size="lg" />
            <Stat label={t("stat.confidence")} value={setup?.confidence != null ? `${Math.round(setup.confidence)}%` : "—"} sub={setup?.bias ?? t("stat.noBias")} size="lg" />
            <Stat label={t("stat.session")} value={session.minutes != null ? `${session.minutes}` : "—"} sub={session.active ? t("stat.minutesLeft") : t("stat.minutesToNext")} size="lg" />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="min-w-0 space-y-4">
          <SetupPanel setup={setup} pending={readingLoading && liqLoading} />
          <Panel label={t("chart.label")} qualifier={t("chart.qualifier")} reading={t("chart.reading")}>
            <PriceChart ticker="BTC-USD" priceAction={chartPa} currentPrice={reading?.price?.current_price} />
          </Panel>
          <LiquidityPanel rows={rows} pending={liqLoading} analysis={liquidity} />
          <BacktestPanel backtest={backtest} />
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[104px]">
          <SessionPanel session={reading?.session ?? liquidity?.session} />
          <CarryPanel />
          <YourCoinsPanel />
        </aside>
      </div>
    </div>
  );
}

function SetupPanel({ setup, pending }: { setup: import("@/modules/crypto/api").Setup | null; pending: boolean }) {
  const t = useTranslations("crypto");
  if (pending) return <PanelPending label={t("setup.label")} text={t("loading")} />;
  if (!setup || setup.error) return <PanelUnavailable label={t("setup.label")} reason={t("setup.unavailable")} />;
  const bias = leanFromBias(setup.bias);
  return (
    <Panel label={t("setup.label")} qualifier={setupLabel(setup.setup_type)} reading={setup.reasoning}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("setup.bias")} value={setup.bias ?? "—"} tone={bias === "on" ? "long" : bias === "off" ? "short" : "caution"} size="sm" />
        <Stat label={t("setup.entry")} value={setup.entry_zone ? `${usd(setup.entry_zone.low)}–${usd(setup.entry_zone.high)}` : "—"} size="sm" />
        <Stat label={t("setup.stop")} value={usd(setup.stop_level)} tone="short" size="sm" />
        <Stat label={t("setup.target1")} value={usd(setup.target_1)} tone="long" size="sm" />
        <Stat label={t("setup.target2")} value={usd(setup.target_2)} tone="long" size="sm" />
        <Stat label={t("setup.invalidation")} value={usd(setup.invalidation)} tone="caution" size="sm" />
      </div>
    </Panel>
  );
}

function SessionPanel({ session }: { session: import("@/modules/crypto/api").Session | undefined }) {
  const t = useTranslations("crypto");
  if (!session) return <PanelUnavailable label={t("session.label")} reason={t("session.unavailable")} />;
  const line = sessionLine(session);
  const active = typeof session.active_session === "string" ? session.active_session : session.active_session?.name;
  return (
    <Panel label={t("session.label")} qualifier={t("session.qualifier")} reading={line.text}>
      <ol className="space-y-2">
        {session.all_sessions.map((s) => (
          <li key={s.name} className={`rounded-control border px-3 py-2 ${s.name === active ? "border-signal/50 bg-signal-bg" : "border-border"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-semibold ${s.name === active ? "text-signal" : "text-foreground"}`}>{s.name}</span>
              <span className="nums font-mono text-[11px] text-muted-foreground">{s.start_utc}–{s.end_utc} UTC</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const NEAREST = 12;

function LiquidityPanel({ rows, pending, analysis }: { rows: LiquidityRow[]; pending: boolean; analysis: import("@/modules/crypto/api").Liquidity | undefined }) {
  const t = useTranslations("crypto");
  // The nearest dozen is the read; the full map is the expert's toggle.
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, NEAREST);
  const zone = (analysis?.premium_discount as { current_zone?: string; equilibrium?: number } | undefined);
  const columns = useMemo<Column<LiquidityRow>[]>(() => [
    { key: "kind", header: t("liq.col.kind"), cell: (r) => <Chip tone={r.kind === "pool" ? "protocol" : r.kind === "fvg" ? "caution" : "plain"}>{t(`liq.kind.${r.kind}` as never)}</Chip> },
    { key: "side", header: t("liq.col.side"), cell: (r) => <span className={/buy|bull/.test(r.side) ? "text-signal-long" : "text-signal-short"}>{r.side.replace(/_/g, " ")}</span> },
    { key: "level", header: t("liq.col.level"), align: "right", sortable: true, sortValue: (r) => r.low, cell: (r) => <span className="nums font-mono">{r.low === r.high ? usd(r.low) : `${usd(r.low)}–${usd(r.high)}`}</span> },
    { key: "distance", header: t("liq.col.distance"), align: "right", sortable: true, sortValue: (r) => r.distance, cell: (r) => <span className="nums font-mono">{r.distance == null ? "—" : `${(r.distance * 100).toFixed(1)}%`}</span> },
    { key: "strength", header: t("liq.col.strength"), align: "right", hideBelow: "sm", cell: (r) => <span className="nums font-mono">{r.strength == null ? "—" : r.strength.toFixed(1)}</span> },
    { key: "touches", header: t("liq.col.touches"), align: "right", hideBelow: "md", cell: (r) => <span className="nums font-mono">{r.touches ?? "—"}</span> },
  ], [t]);
  if (pending) return <PanelPending label={t("liq.label")} text={t("loading")} />;
  if (!analysis || analysis.error) return <PanelUnavailable label={t("liq.label")} reason={t("liq.unavailable")} />;
  return (
    <Panel
      label={t("liq.label")}
      qualifier={zone?.current_zone ? t("liq.zone", { zone: zone.current_zone.replace(/_/g, " "), eq: usd(zone.equilibrium) }) : undefined}
      aside={
        <span className="flex items-center gap-2">
          {rows.length > NEAREST && (
            <Segmented
              mode="toggle"
              size="sm"
              ariaLabel={t("liq.scopeLabel")}
              value={showAll ? "all" : "nearest"}
              onChange={(v) => setShowAll(v === "all")}
              options={[{ value: "nearest", label: t("liq.nearest", { count: NEAREST }) }, { value: "all", label: t("liq.all", { count: rows.length }) }]}
            />
          )}
          {analysis.stale ? <Freshness stale at={analysis.generated_at} /> : <Freshness at={analysis.generated_at} />}
        </span>
      }
      reading={t("liq.reading")}
    >
      <DataTable caption={t("liq.label")} columns={columns} rows={shown} rowKey={(r) => r.id} defaultSort={{ key: "distance", dir: "asc" }} countLabel={(n) => t("liq.count", { count: n })} />
    </Panel>
  );
}

function BacktestPanel({ backtest }: { backtest: import("@/modules/crypto/api").Backtest | undefined }) {
  const t = useTranslations("crypto");
  const pal = usePalette();
  const summary = (backtest?.summary as { overall?: Record<string, number | number[]> } | null | undefined)?.overall;
  const curve = (summary?.equity_curve as number[] | undefined) ?? [];
  const path = equityPath(curve, 240, 48);
  return (
    <Disclosure label={t("bt.label")} qualifier={backtest?.run_at ? t("bt.qualifier", { date: backtest.run_at.slice(0, 10), tf: backtest.timeframe }) : undefined}>
      {!summary ? (
        <p className="text-sm text-muted-foreground">{t("bt.none")}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("bt.sharpe")} value={typeof summary.sharpe_r === "number" ? summary.sharpe_r.toFixed(2) : "—"} tone={typeof summary.sharpe_r === "number" && summary.sharpe_r > 0 ? "long" : "short"} size="sm" />
            <Stat label={t("bt.winRate")} value={typeof summary.win_rate === "number" ? `${(summary.win_rate * 100).toFixed(0)}%` : "—"} size="sm" />
            <Stat label={t("bt.trades")} value={backtest?.trade_count ?? (typeof summary.total_trades === "number" ? summary.total_trades : "—")} size="sm" />
            <Stat label={t("bt.best")} value={typeof summary.best_trade_r === "number" ? `${summary.best_trade_r.toFixed(2)}R` : "—"} size="sm" />
          </div>
          {pal && path.d && (
            <svg viewBox="0 0 240 48" className="block h-12 w-full max-w-sm" role="img" aria-label={t("bt.curveAria")}>
              <path d={path.d} fill="none" stroke={curve[curve.length - 1] >= 0 ? pal.long : pal.short} strokeWidth={1.5} />
            </svg>
          )}
          <p className="card-reading">{t("bt.reading", { lookback: backtest?.lookback ?? "—", conf: backtest?.min_confidence ?? "—" })}</p>
        </div>
      )}
    </Disclosure>
  );
}

// What long spot / short perp on BTC and ETH pays now, against cash. A
// display of the carry backtest's one input (the funding stream), not a rule:
// a switching rule would need its own pre-registration (CARRY_GATE.md).
const CARRY_SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;
const apr = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

function CarryPanel() {
  const t = useTranslations("crypto");
  const pal = usePalette();
  const { data, isLoading, isError } = useQuery({ queryKey: ["crypto-desk", "carry"], queryFn: cryptoApi.carry, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000, retry: 1 });
  if (isLoading) return <PanelPending label={t("carry.label")} text={t("loading")} />;
  if (isError || !data || !data.state) return <PanelUnavailable label={t("carry.label")} reason={t("carry.unavailable")} />;
  const cash = apr(data.cash_apr);
  const bt = data.backtest;
  return (
    <Panel
      label={t("carry.label")}
      qualifier={t("carry.qualifier")}
      tone={data.state === "above_cash" ? "signal" : "plain"}
      aside={data.as_of ? <Freshness at={data.as_of} label={t("carry.asOf")} /> : undefined}
      reading={
        data.state === "above_cash" ? t("carry.reading.above_cash", { yield: apr(data.book_capital_apr_7d), cash })
          : data.state === "positive" ? t("carry.reading.positive", { yield: apr(data.book_capital_apr_7d), cash })
            : t("carry.reading.negative")
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat size="sm" label={t("carry.stat.book")} value={apr(data.book_capital_apr_7d)} tone={data.state === "above_cash" ? "long" : data.state === "negative" ? "short" : "caution"} sub={t("carry.legendCash", { cash })} />
        <Stat size="sm" label={t("carry.stat.book30")} value={apr(data.book_capital_apr_30d)} />
        {CARRY_SYMBOLS.map((s) => {
          const x = data.symbols[s];
          return (
            <Stat key={s} size="sm" label={`${s.replace("USDT", "")} · 7d`} value={apr(x?.capital_apr_7d)}
                  sub={x ? t("carry.stat.funding", { value: apr(x.funding_apr_7d) }) : undefined} />
          );
        })}
      </div>
      {pal && <CarrySpark card={data} colors={[pal.chart[0], pal.chart[1]]} cashColor={pal.mutedFg} zeroColor={pal.border} />}
      <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
        {CARRY_SYMBOLS.map((s, i) => (
          <span key={s}><span aria-hidden style={{ color: pal?.chart[i] }}>━</span> {s.replace("USDT", "")}</span>
        ))}
        <span><span aria-hidden>┅</span> {t("carry.legendCash", { cash })}</span>
      </p>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {CARRY_SYMBOLS.map((s) => data.symbols[s]).filter(Boolean).slice(0, 1).map((x) => t("carry.stat.next", { time: x!.next_at.slice(11, 16), rate: `${(x!.last_rate * 100).toFixed(4)}%` }))}
      </p>
      <Disclosure label={t("carry.explainLabel")} className="mt-3">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("carry.explain")}</p>
          {bt?.apr_2024_2025 != null && (
            <p>{t("carry.backtest", { apr: apr(bt.apr_2024_2025), mdd: apr(bt.mdd, 2), h1: apr(bt.halves["2024H1"]), h2: apr(bt.halves["2024H2"]), h3: apr(bt.halves["2025H1"]), h4: apr(bt.halves["2025H2"]) })}</p>
          )}
        </div>
      </Disclosure>
    </Panel>
  );
}

function CarrySpark({ card, colors, cashColor, zeroColor }: { card: CarryCard; colors: string[]; cashColor: string; zeroColor: string }) {
  const t = useTranslations("crypto");
  const W = 320, H = 84, P = 4;
  const series = CARRY_SYMBOLS.map((s) => card.symbols[s]?.series ?? []);
  const n = Math.max(...series.map((x) => x.length), 0);
  if (n < 2) return null;
  const vals = series.flat().map((p) => p.capital_apr);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(card.cash_apr * 1.25, ...vals);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const x = (i: number, len: number) => P + (i / (len - 1)) * (W - 2 * P);
  const path = (pts: Array<{ capital_apr: number }>) => pts.map((p, i) => `${i ? "L" : "M"}${x(i, pts.length).toFixed(1)},${y(p.capital_apr).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-[84px] w-full" role="img" aria-label={t("carry.chartAria")}>
      {lo < 0 && <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke={zeroColor} strokeWidth={1} />}
      <line x1={P} x2={W - P} y1={y(card.cash_apr)} y2={y(card.cash_apr)} stroke={cashColor} strokeWidth={1} strokeDasharray="4 3" />
      {series.map((pts, i) => pts.length > 1 && <path key={i} d={path(pts)} fill="none" stroke={colors[i]} strokeWidth={1.5} />)}
    </svg>
  );
}

function YourCoinsPanel() {
  const t = useTranslations("crypto");
  const { data: user } = useUser();
  const { data: tickers } = useMyWatchlistTickers();
  const coins = useMemo(() => [...(tickers ?? [])].filter(isCryptoTicker).sort(), [tickers]);
  const { data: live } = useQuery({ queryKey: ["crypto-desk", "tickers", coins.join(",")], queryFn: () => cryptoApi.tickers(coins), enabled: coins.length > 0, staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
  if (!user) return <PanelUnavailable label={t("coins.label")} reason={t("coins.signedOut")} aside={<Link href="/login" className="text-signal hover:underline">{t("coins.signIn")}</Link>} />;
  if (!coins.length) return <PanelUnavailable label={t("coins.label")} reason={t("coins.none")} aside={<Link href="/watchlist" className="text-signal hover:underline">{t("coins.openWatchlist")}</Link>} />;
  return (
    <Panel label={t("coins.label")} qualifier={t("coins.qualifier", { count: coins.length })} reading={t("coins.reading")}>
      <ul className="space-y-1.5">
        {coins.map((c) => {
          const q = live?.tickers?.[c];
          return (
            <li key={c} className="flex items-baseline justify-between gap-2 text-sm">
              <Link href={`/stock/${c}`} className="font-mono font-semibold text-signal hover:underline">{c}</Link>
              <span className="nums font-mono">{q?.price != null ? usd(q.price, q.price < 10 ? 4 : 2) : "—"}</span>
              <span className={`nums font-mono text-xs ${(q?.change_24h_pct ?? 0) >= 0 ? "text-signal-long" : "text-signal-short"}`}>{pct(q?.change_24h_pct)}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
