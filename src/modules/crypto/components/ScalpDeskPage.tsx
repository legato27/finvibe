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
import { cryptoApi, type ScalpRow, type ScalpSignal } from "@/modules/crypto/api";

const STATUS_TONE: Record<ScalpRow["status"], ChipTone> = { fired: "signal", unlogged: "caution", near: "protocol", far: "plain" };
const EXECUTION_TONE: Record<ScalpSignal["execution"], ChipTone> = { pending: "protocol", filled: "signal", closed: "plain", unfilled: "caution" };
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
          onChange={(v) => { if (v === "crypto") router.push("/desk/crypto"); else if (v !== "scalp") router.push(`/desk?strategy=${v}`); }}
          options={[
            { value: "csp", label: t("switchPuts") },
            { value: "covered_call", label: t("switchCalls") },
            { value: "crypto", label: t("switchCrypto") },
            { value: "scalp", label: t("switchScalp") },
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
    </div>
  );
}
