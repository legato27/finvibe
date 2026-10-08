"use client";

/**
 * Desk → Scalp. The second strategy family on the same desk, on the desk's
 * grammar: the answer first (the risk state, three Stats, the halt button),
 * then the ranked setups on a DataTable — hard gates, then a score — with
 * every condition under a Disclosure per row, then the active signals.
 * Reads /api/crypto-desk/scalp/desk; the only writes are halt and resume.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import Stat from "@/components/ui/Stat";
import Segmented from "@/components/ui/Segmented";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import Disclosure from "@/components/ui/Disclosure";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Freshness from "@/components/ui/Freshness";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cryptoApi, type CryptoScorecardBlock, type H8Status, type ScalpRow, type ScalpSignal } from "@/modules/crypto/api";
import { usePalette } from "@/components/heatmap/palette";
import TradeJournal from "@/components/stock/TradeJournal";

const STATUS_TONE: Record<ScalpRow["status"], ChipTone> = { fired: "signal", unlogged: "caution", near: "protocol", far: "plain" };
const EXECUTION_TONE: Record<ScalpSignal["execution"], ChipTone> = { pending: "protocol", filled: "signal", closed: "plain", unfilled: "caution" };
const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);
const rr = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`);
type RecordRow = { key: string; label: string; b: CryptoScorecardBlock };
const hhmm = (iso: string | null | undefined) => (iso ? `${new Date(iso).toUTCString().slice(17, 22)} UTC` : "—");
const STATE_TONE: Record<string, ChipTone> = { active: "signal", paused: "caution", halted: "short" };
const SETUP_KEY: Record<string, string> = { A: "setupA", B: "setupB", C: "setupC" };

const px = (n: number | null | undefined) => (n == null ? "—" : n >= 100 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(5));
const bps = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}`);

export function ScalpDeskPage() {
  const t = useTranslations("scalp");
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tier, setTier] = useState<ScalpRow["status"] | "all">("all");
  const [reason, setReason] = useState("");
  const { data, isLoading, isError } = useQuery({ queryKey: ["scalp-desk"], queryFn: () => cryptoApi.scalpDesk(), staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
  const halt = useMutation({ mutationFn: (r: string) => cryptoApi.halt(r), onSuccess: () => qc.invalidateQueries({ queryKey: ["scalp-desk"] }) });
  const resume = useMutation({ mutationFn: () => cryptoApi.resume(), onSuccess: () => qc.invalidateQueries({ queryKey: ["scalp-desk"] }) });

  const risk = data?.risk;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => tier === "all" || r.status === tier), [data, tier]);

  const columns: Column<ScalpRow>[] = [
    { key: "symbol", header: t("col.symbol"), sortable: true, sortValue: (r) => r.symbol, cell: (r) => <span className="font-semibold">{r.symbol.replace("USDT", "")}</span> },
    { key: "setup", header: t("col.setup"), sortable: true, sortValue: (r) => r.setup, cell: (r) => <span>{t(SETUP_KEY[r.setup] as never)}</span> },
    { key: "status", header: t("col.status"), sortable: true, sortValue: (r) => r.score, cell: (r) => <Chip tone={STATUS_TONE[r.status]}>{t(`tier.${r.status}` as never)} {r.met}/{r.total}</Chip> },
    { key: "side", header: t("col.side"), hideBelow: "md", cell: (r) => (r.side ? <span className={r.side === "long" ? "text-signal-long" : "text-signal-short"}>{t(`side.${r.side}` as never)}</span> : "—") },
    { key: "price", header: t("col.price"), align: "right", hideBelow: "md", cell: (r) => <span className="nums">{px(r.price)}</span> },
    { key: "edge", header: t("col.edge"), align: "right", sortable: true, sortValue: (r) => r.edge_bps ?? -999, hideBelow: "lg", cell: (r) => <span className="nums">{bps(r.edge_bps)}</span> },
    { key: "levels", header: t("col.levels"), hideBelow: "lg", optional: true, cell: (r) => (r.levels ? <span className="nums text-xs">{px(r.levels.entry)} / {px(r.levels.invalidation)} / {px(r.levels.target)}</span> : "—") },
    { key: "gates", header: t("col.gates"), hideBelow: "sm", cell: (r) => (r.gates.passed ? <Chip tone="signal">{t("gatesOk")}</Chip> : <Chip tone="caution">{r.gates.failed.join(", ")}</Chip>) },
    {
      key: "waiting", header: t("col.waiting"), cell: (r) => {
        const miss = r.conditions.find((c) => !c.ok);
        return miss ? <span className="text-xs text-muted-foreground">{miss.name}{miss.detail ? ` · ${miss.detail}` : ""}</span> : <span className="text-xs text-signal">{t("allConditions")}</span>;
      },
    },
  ];

  const signalColumns: Column<ScalpSignal>[] = [
    { key: "symbol", header: t("col.symbol"), cell: (s) => <span className="font-semibold">{s.symbol.replace("USDT", "")}</span> },
    { key: "setup", header: t("col.setup"), cell: (s) => t(SETUP_KEY[s.setup] as never) },
    { key: "side", header: t("col.side"), cell: (s) => t(`side.${s.side}` as never) },
    { key: "state", header: t("col.state"), cell: (s) => <Chip tone={EXECUTION_TONE[s.execution]}>{t(`state.${s.execution}` as never)}</Chip> },
    { key: "filled", header: t("col.filled"), hideBelow: "md", cell: (s) => <span className="text-xs">{hhmm(s.fill_at)}</span> },
    { key: "entry", header: t("col.entry"), align: "right", cell: (s) => <span className="nums">{px(s.entry_px)}</span> },
    { key: "stop", header: t("col.stop"), align: "right", hideBelow: "md", cell: (s) => <span className="nums">{px(s.invalidation_px)}</span> },
    { key: "target", header: t("col.target"), align: "right", hideBelow: "md", cell: (s) => <span className="nums">{px(s.target_px)}</span> },
    { key: "r", header: t("col.r"), align: "right", cell: (s) => <span className="nums">{s.r_planned == null ? "—" : `${s.r_planned.toFixed(1)}R`}</span> },
    { key: "timeStop", header: t("col.timeStop"), hideBelow: "lg", cell: (s) => <span className="text-xs">{hhmm(s.time_stop_at)}</span> },
  ];

  // The engine's own record for this family, graded at fill and exit by the
  // paper broker: signals, fills, wins, average R and how each exit came.
  // Lives here and not on the options desk, whose table is in premium terms.
  const record = useQuery({
    queryKey: ["crypto-reco-scorecard", 400, "paper"],
    queryFn: () => cryptoApi.scorecard(400, "paper"),
    staleTime: 60 * 60_000,
    retry: 1,
  });
  const recordRows: RecordRow[] = record.data
    ? [
        { key: "all", label: t("record.all"), b: record.data.overall },
        ...Object.entries(record.data.by_strategy ?? {}).map(([k, b]) => ({ key: k, label: t(SETUP_KEY[k.replace("scalp_", "")] as never) || k, b })),
        // the retune's kept hypothesis: A signals with strong order flow behind the trigger, against the rest
        ...Object.entries(record.data.by_trigger ?? {})
          .sort(([a], [b]) => (a.endsWith("strong_flow") ? -1 : 0) - (b.endsWith("strong_flow") ? -1 : 0))
          .map(([k, b]) => ({ key: k, label: t(`record.trigger.${k.split("/")[1]}` as never) || k, b })),
      ]
    : [];
  const recordColumns: Column<RecordRow>[] = [
    { key: "setup", header: t("record.col.setup"), cell: (r) => <span className="font-medium">{r.label}</span> },
    { key: "signals", header: t("record.col.signals"), align: "right", cell: (r) => <span className="nums">{r.b.n_signals}</span> },
    { key: "filled", header: t("record.col.filled"), align: "right", cell: (r) => <span className="nums">{pct(r.b.fill_rate)}</span> },
    // after fees first: the round trip is ~0.2R a trade, the gap between "roughly flat" and a losing sleeve
    { key: "won", header: t("record.col.won"), align: "right", cell: (r) => <span className="nums">{pct(r.b.win_rate_net ?? r.b.win_rate)}</span> },
    { key: "avgR", header: t("record.col.avgR"), align: "right", cell: (r) => { const v = r.b.avg_r_net ?? r.b.avg_r; return <span className={`nums ${(v ?? 0) < 0 ? "text-signal-short" : ""}`}>{rr(v)}</span>; } },
    { key: "grossR", header: t("record.col.grossR"), align: "right", hideBelow: "md", cell: (r) => <span className="nums text-muted-foreground">{rr(r.b.avg_r)}</span> },
    { key: "feeR", header: t("record.col.feeR"), align: "right", hideBelow: "lg", cell: (r) => <span className="nums text-muted-foreground">{r.b.avg_fee_r == null ? "—" : `${r.b.avg_fee_r.toFixed(2)}R`}</span> },
    { key: "exits", header: t("record.col.exits"), hideBelow: "md", cell: (r) => <span className="nums text-xs">{pct(r.b.target_rate)} / {pct(r.b.stop_rate)} / {pct(r.b.time_stop_rate)}</span> },
    { key: "gap", header: t("record.col.gap"), align: "right", hideBelow: "md", cell: (r) => <span className="nums">{r.b.calibration_gap == null ? "—" : `${r.b.calibration_gap > 0 ? "+" : ""}${(r.b.calibration_gap * 100).toFixed(0)}`}</span> },
  ];

  async function onHalt() {
    const r = reason.trim() || t("haltDefaultReason");
    if (await confirm({ title: t("haltConfirmTitle"), body: t("haltConfirmBody", { reason: r }), confirmLabel: t("haltConfirm"), destructive: true })) halt.mutate(r);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="font-mono text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Segmented
          ariaLabel={t("deskSwitch")}
          value="scalp"
          onChange={(v) => { if (v === "crypto") router.push("/desk/crypto"); else if (v === "journal") router.push("/desk/journal"); else if (v !== "scalp") router.push(`/desk?strategy=${v}`); }}
          options={[
            { value: "csp", label: t("switchPuts") },
            { value: "covered_call", label: t("switchCalls") },
            { value: "crypto", label: t("switchCrypto") },
            { value: "scalp", label: t("switchScalp") },
            { value: "journal", label: t("switchJournal") },
          ]}
        />
      </header>

      {/* ── Risk: the answer first ── */}
      {isLoading ? (
        <PanelPending label={t("riskLabel")} text={t("loading")} />
      ) : isError || !data || !risk ? (
        <PanelUnavailable label={t("riskLabel")} reason={t("unavailable")} />
      ) : (
        <Panel
          label={t("riskLabel")}
          tone={risk.state === "active" ? "signal" : "plain"}
          aside={<Freshness at={data.as_of} label={t("asOf")} />}
          reading={risk.state === "active" ? t("riskReading.active") : risk.state === "paused" ? t("riskReading.paused", { reason: risk.reason ?? "" }) : t("riskReading.halted", { reason: risk.reason ?? "" })}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat size="sm" label={t("stat.state")} value={<Chip tone={STATE_TONE[risk.state]}>{t(`state.${risk.state}` as never)}</Chip>} sub={risk.since ? t("stat.stateSince", { since: risk.since.slice(0, 16).replace("T", " ") }) : t("stat.stateAlways")} />
            <Stat size="sm" label={t("stat.nav")} value={`$${risk.budgets.sleeve_nav_usd.toLocaleString()}`} sub={t("stat.navSub", { risk: risk.budgets.risk_per_trade_usd })} />
            <Stat size="sm" label={t("stat.loss")} value={`${risk.today.daily_loss_used_r.toFixed(2)}R`} sub={t("stat.lossSub", { max: risk.budgets.max_daily_loss_r })} tone={risk.today.daily_loss_used_r >= risk.budgets.max_daily_loss_r ? "short" : risk.today.daily_loss_used_r > 0 ? "caution" : "plain"} />
            <Stat size="sm" label={t("stat.trades")} value={`${risk.today.trades_used} / ${risk.budgets.max_trades_per_day}`} sub={t("stat.tradesSub", { open: risk.today.open_signals })} />
            <Stat size="sm" label={t("stat.streak")} value={String(risk.today.consecutive_losses)} sub={t("stat.streakSub", { max: risk.budgets.max_consecutive_losses })} tone={risk.today.consecutive_losses >= risk.budgets.max_consecutive_losses ? "short" : "plain"} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {risk.state === "active" ? (
              <>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("haltReasonPlaceholder")}
                  aria-label={t("haltReasonPlaceholder")}
                  className="min-w-[16rem] flex-1 rounded-control border border-border bg-background px-3 py-1.5 text-sm"
                />
                <button type="button" onClick={onHalt} disabled={halt.isPending} className="rounded-control border border-signal-short/50 bg-signal-short-bg px-3 py-1.5 text-sm font-semibold text-signal-short">
                  {t("haltButton")}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => resume.mutate()} disabled={resume.isPending} className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                {t("resumeButton")}
              </button>
            )}
            {halt.error || resume.error ? <span className="text-xs text-signal-short">{t("actionFailed")}</span> : null}
          </div>
        </Panel>
      )}

      {/* ── H8, the candidate replacement, tracked through its gate ── */}
      <H8Panel />

      {/* ── Ranked setups ── */}
      {isLoading ? (
        <PanelPending label={t("deskLabel")} text={t("loading")} />
      ) : isError || !data ? (
        <PanelUnavailable label={t("deskLabel")} reason={t("unavailable")} />
      ) : (
        <Panel label={t("deskLabel")} qualifier={t("deskQualifier", { symbols: data.symbols })} reading={t("deskReading", { fired: data.tiers.fired, near: data.tiers.near })}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip active={tier === "all"} onClick={() => setTier("all")}>{t("tier.all")} {data.count}</Chip>
            {(["fired", "unlogged", "near", "far"] as const).map((k) => (
              <Chip key={k} active={tier === k} onClick={() => setTier(k)} tone={STATUS_TONE[k]}>{t(`tier.${k}` as never)} {data.tiers[k]}</Chip>
            ))}
          </div>
          <DataTable<ScalpRow>
            caption={t("tableCaption")}
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.symbol}:${r.setup}`}
            defaultSort={{ key: "status", dir: "desc" }}
            emptyText={t("empty")}
          />
          <Disclosure label={t("gatesLabel")} className="mt-3">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {Object.entries(data.gates ?? {}).map(([k, v]) => <li key={k}><span className="font-semibold text-foreground">{k}</span> · {v}</li>)}
            </ul>
          </Disclosure>
        </Panel>
      )}

      {/* ── Active signals ── */}
      <Panel label={t("signalsLabel")} qualifier={data ? t("signalsQualifier", { count: data.active_signals.length }) : undefined}>
        {data && data.active_signals.length ? (
          <DataTable<ScalpSignal> caption={t("signalsCaption")} columns={signalColumns} rows={data.active_signals} rowKey={(s) => s.signal_id} />
        ) : (
          <p className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground">{t("signalsEmpty")}</p>
        )}
      </Panel>

      {/* ── The journal: what the paper broker executed, with every fill and
             exit timestamped. Scalps belong here, not on the options desk. ── */}
      <TradeJournal family="crypto" />

      {/* ── The engine's record for this family ── */}
      {record.error ? (
        <PanelUnavailable label={t("record.label")} reason={t("unavailable")} />
      ) : (
        <Panel label={t("record.label")} qualifier={record.data ? t("record.qualifier", { count: record.data.overall.n, days: record.data.window_days }) : undefined}>
          <p className="mb-3 text-sm text-muted-foreground">{t("record.lead")}</p>
          {recordRows.length ? (
            <DataTable<RecordRow> caption={t("record.caption")} columns={recordColumns} rows={recordRows} rowKey={(r) => r.key} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          )}
        </Panel>
      )}
    </div>
  );
}

// H8, the pump distribution short: where its pre-registered research stands,
// what design and the single test run found, and (if it passes) its paper run.
const H8_ORDER = ["preregistered", "data", "design", "test", "verdict", "paper"] as const;
const H8_TONE: Record<string, ChipTone> = { done: "signal", passed: "signal", running: "protocol", failed: "short", pending: "plain", not_started: "plain", only_if_passed: "plain" };

function H8Panel() {
  const t = useTranslations("scalp");
  const pal = usePalette();
  const { data, isLoading, isError } = useQuery({ queryKey: ["crypto-h8"], queryFn: cryptoApi.h8, staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, retry: 1 });
  if (isLoading) return <PanelPending label={t("h8.label")} text={t("loading")} />;
  if (isError || !data) return <PanelUnavailable label={t("h8.label")} reason={t("h8.unavailable")} />;
  const st = data.stages;
  const [dFrom, dTo] = data.periods.design;
  const [tFrom, tTo] = data.periods.test;
  const checks = data.test?.checks ?? {};
  const failed = Object.values(checks).filter((ok) => !ok).length;
  const reading =
    st.verdict.state === "passed" ? t("h8.reading.passed")
      : st.verdict.state === "failed" ? t("h8.reading.failed", { failed, total: Object.keys(checks).length })
        : st.design.state === "done" && !st.design.chosen ? t("h8.reading.designDead")
          : st.design.state === "done" ? t("h8.reading.test", { variant: st.design.chosen ?? "—", from: tFrom, to: tTo })
            : st.data.state === "done" ? t("h8.reading.design", { from: dFrom, to: dTo })
              : t("h8.reading.data", { fetched: st.data.fetched ?? 0, symbols: st.data.symbols ?? "…" });
  const curve = data.test_curve ?? data.design_curve ?? null;
  const designRows = Object.entries(data.design ?? {}).map(([v, g]) => ({ v, g }));
  const designCols: Column<{ v: string; g: NonNullable<H8Status["design"]>[string] }>[] = [
    { key: "variant", header: t("h8.col.variant"), cell: (r) => <span className="font-mono font-semibold">{r.v}{r.v === st.design.chosen ? <Chip tone="signal" className="ml-2">{t("h8.chosen")}</Chip> : null}</span> },
    { key: "rule", header: t("h8.col.rule"), hideBelow: "md", cell: (r) => <span className="text-xs">{data.variants[r.v]}</span> },
    { key: "trades", header: t("h8.col.trades"), align: "right", cell: (r) => <span className="nums">{r.g.n}</span> },
    { key: "net", header: t("h8.col.net"), align: "right", cell: (r) => <span className={`nums ${(r.g.avg_r_net ?? 0) < 0 ? "text-signal-short" : ""}`}>{rr(r.g.avg_r_net)}</span> },
    { key: "gross", header: t("h8.col.gross"), align: "right", hideBelow: "md", cell: (r) => <span className="nums text-muted-foreground">{rr(r.g.avg_r_gross)}</span> },
    { key: "won", header: t("h8.col.won"), align: "right", hideBelow: "md", cell: (r) => <span className="nums">{pct(r.g.win_rate_net)}</span> },
    { key: "t", header: t("h8.col.t"), align: "right", hideBelow: "lg", cell: (r) => <span className="nums">{r.g.t_daily == null ? "—" : r.g.t_daily.toFixed(2)}</span> },
  ];
  const sum = data.test?.summary ?? {};
  const num = (k: string) => (typeof sum[k] === "number" ? (sum[k] as number) : null);
  return (
    <Panel label={t("h8.label")} qualifier={t("h8.qualifier", { commit: data.gate_commit })}
           tone={st.verdict.state === "passed" ? "signal" : "plain"} reading={reading}>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label={t("h8.label")}>
        {H8_ORDER.map((k, i) => {
          const s = st[k].state;
          return (
            <li key={k} className="flex items-center gap-1.5">
              <Chip tone={data.current === k && s !== "done" ? "protocol" : H8_TONE[s] ?? "plain"}>
                {t(`h8.stage.${k}`)} · {k === "data" && s === "running" ? `${st.data.fetched ?? 0}/${st.data.symbols ?? "…"}` : t(`h8.state.${s}` as never)}
              </Chip>
              {i < H8_ORDER.length - 1 && <span aria-hidden className="text-dim">›</span>}
            </li>
          );
        })}
      </ol>

      {data.test && (
        <div className="mt-4">
          <p className="card-title">{t("h8.testLabel", { variant: data.test.variant, from: tFrom, to: tTo })}</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat size="sm" label={t("h8.stat.n")} value={String(num("n") ?? "—")} />
            <Stat size="sm" label={t("h8.stat.net")} value={rr(num("avg_r_net"))} tone={(num("avg_r_net") ?? 0) >= 0.1 ? "long" : "short"} />
            <Stat size="sm" label={t("h8.stat.t")} value={num("t_daily") == null ? "—" : num("t_daily")!.toFixed(2)} />
            <Stat size="sm" label={t("h8.stat.won")} value={pct(num("win_rate_net"))} />
          </div>
          <ul className="mt-3 grid gap-1 font-mono text-xs sm:grid-cols-2">
            {Object.entries(checks).map(([k, ok]) => (
              <li key={k} className={ok ? "text-signal-long" : "text-signal-short"}>{ok ? "✓" : "✗"} {data.gate_labels[k] ?? k}</li>
            ))}
          </ul>
        </div>
      )}

      {curve && curve.points.length > 1 && pal && (
        <div className="mt-4">
          <H8Spark points={curve.points} color={(curve.points[curve.points.length - 1]?.r ?? 0) >= 0 ? pal.long : pal.short} zero={pal.mutedFg} />
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{data.test_curve ? t("h8.curveTest") : t("h8.curveDesign", { variant: st.design.chosen ?? "—" })} · {curve.n}</p>
        </div>
      )}

      {designRows.length > 0 && (
        <Disclosure label={t("h8.designLabel", { from: dFrom, to: dTo })} className="mt-4">
          <DataTable caption={t("h8.designCaption")} columns={designCols} rows={designRows} rowKey={(r) => r.v} />
        </Disclosure>
      )}

      <Disclosure label={t("h8.whatLabel")} className="mt-3">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("h8.what")}</p>
          <p className="font-mono text-[11px]">{t("h8.rules", { commit: data.gate_commit, fix: data.fix_commits.join(", ") })}</p>
        </div>
      </Disclosure>
    </Panel>
  );
}

function H8Spark({ points, color, zero }: { points: Array<{ t: string; r: number }>; color: string; zero: string }) {
  const t = useTranslations("scalp");
  const W = 640, H = 80, P = 4;
  const vs = points.map((p) => p.r);
  const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: 80 }} role="img" aria-label={t("h8.curveAria")}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke={zero} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <path d={points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join("")} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
