"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { RefreshCw, CheckCircle2, XCircle, Loader2, Clock, MinusCircle, AlertTriangle } from "lucide-react";
import { jobsApi } from "@/lib/api";

interface RunInfo {
  task_id: string;
  status: string | null;
  trigger: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  worker: string | null;
}
interface JobRow {
  key: string;
  task_name: string;
  short_name: string;
  schedule: string;
  next_run: string | null;
  running: boolean;
  last: RunInfo | null;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const t = useTranslations("jobRuns");
  const map: Record<string, { cls: string; icon: React.ReactNode; key: string }> = {
    success: { cls: "text-signal-long", icon: <CheckCircle2 className="w-3.5 h-3.5" />, key: "statusSuccess" },
    failure: { cls: "text-signal-short", icon: <XCircle className="w-3.5 h-3.5" />, key: "statusFailure" },
    started: { cls: "text-primary", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, key: "statusRunning" },
    queued: { cls: "text-signal-caution", icon: <Clock className="w-3.5 h-3.5" />, key: "statusQueued" },
    stale: { cls: "text-signal-caution", icon: <AlertTriangle className="w-3.5 h-3.5" />, key: "statusStale" },
  };
  const s = status ? map[status] : undefined;
  if (!s) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MinusCircle className="w-3.5 h-3.5" /> {t("statusNever")}
    </span>
  );
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.cls}`}>{s.icon} {t(s.key)}</span>;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function JobRunsCard() {
  const t = useTranslations("jobRuns");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const { data, isLoading, error } = useQuery<{ jobs: JobRow[] }>({
    queryKey: ["jobs-status"],
    queryFn: () => jobsApi.status(),
    refetchInterval: 8_000,
    staleTime: 5_000,
  });

  async function rerun(job: JobRow) {
    setBusy(job.task_name);
    setNote(null);
    try {
      await jobsApi.rerun(job.task_name);
      setNote({ kind: "ok", msg: t("rerunQueued", { job: job.short_name }) });
      qc.invalidateQueries({ queryKey: ["jobs-status"] });
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setNote({ kind: "err", msg: status === 409 ? (detail || t("rerunBusy")) : t("rerunFailed") });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <div className="card p-6 text-sm text-muted-foreground" role="status">{t("loading")}</div>;
  if (error) return <div className="card p-6 text-sm text-signal-short">{t("loadError")}</div>;

  const jobs = data?.jobs ?? [];

  return (
    <div className="space-y-3">
      {note && (
        <div
          role="status"
          className={`text-xs rounded-lg border px-3 py-2 ${
            note.kind === "ok"
              ? "border-success/30 bg-success/5 text-signal-long"
              : "border-danger/30 bg-danger/5 text-signal-short"
          }`}
        >
          {note.msg}
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-left">{t("colJob")}</th>
              <th scope="col" className="px-3 py-2 text-left">{t("colStatus")}</th>
              <th scope="col" className="px-3 py-2 text-left hidden sm:table-cell">{t("colStarted")}</th>
              <th scope="col" className="px-3 py-2 text-left hidden md:table-cell">{t("colCompleted")}</th>
              <th scope="col" className="px-3 py-2 text-right hidden sm:table-cell">{t("colDuration")}</th>
              <th scope="col" className="px-3 py-2 text-left hidden lg:table-cell">{t("colNextRun")}</th>
              <th scope="col" className="px-3 py-2 text-right">{t("colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.key} className="border-b border-border/50 last:border-0 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground/90">{j.short_name}</div>
                  <div className="text-[10px] text-muted-foreground">{j.key}</div>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={j.running ? "started" : j.last?.status} />
                  {j.last?.error && (
                    <div className="mt-0.5 max-w-[20rem] truncate text-[10px] text-signal-short" title={j.last.error}>
                      {j.last.error}
                    </div>
                  )}
                  {j.last?.trigger === "manual" && (
                    <div className="text-[10px] text-muted-foreground">{t("manual")}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell nums">{fmtTime(j.last?.started_at)}</td>
                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell nums">{fmtTime(j.last?.completed_at)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground hidden sm:table-cell nums">{fmtDur(j.last?.duration_ms)}</td>
                <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell nums" title={j.schedule}>{fmtTime(j.next_run)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => rerun(j)}
                    disabled={j.running || busy === j.task_name}
                    title={j.running ? t("rerunBusy") : t("rerun")}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3 h-3 ${busy === j.task_name ? "animate-spin" : ""}`} />
                    {t("rerun")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
