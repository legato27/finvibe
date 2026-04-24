"use client";
import { useMemo, useState } from "react";
import ReactMarkdownRaw from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles, Cpu, Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Clock, Trash2, ShieldAlert, Activity, Target, FileText,
} from "lucide-react";
import {
  portfolioAnalysisApi,
  type PortfolioAnalysisBody,
  type StructuredAnalysis,
} from "@/lib/api";
import {
  usePortfolioAnalyses,
  useSavePortfolioAnalysis,
  useDeletePortfolioAnalysis,
  type PortfolioAnalysis,
} from "@/lib/supabase/hooks";

const ReactMarkdown = ReactMarkdownRaw as unknown as React.FC<{
  children: string;
  remarkPlugins?: unknown[];
}>;

type Position = {
  ticker: string;
  name?: string;
  sector?: string;
  totalShares: number;
  avgCostBasis: number;
  current_price?: number;
};

function buildSnapshot(
  positions: Position[],
  totalValue: number,
): PortfolioAnalysisBody["holdings"] {
  return positions.map((p) => {
    const price = p.current_price ?? p.avgCostBasis;
    const mkt_value = p.totalShares * price;
    const weight_pct = totalValue > 0 ? (mkt_value / totalValue) * 100 : 0;
    return {
      ticker: p.ticker,
      name: p.name,
      sector: p.sector,
      shares: p.totalShares,
      cost_basis: p.avgCostBasis,
      current_price: p.current_price,
      mkt_value,
      weight_pct,
    };
  });
}

export function PortfolioAnalysisPanel({
  portfolioId,
  portfolioName,
  positions,
  totalValue,
  totalCost,
}: {
  portfolioId: number;
  portfolioName: string;
  positions: Position[];
  totalValue: number;
  totalCost: number;
}) {
  const { data: analyses, isLoading } = usePortfolioAnalyses(portfolioId);
  const save = useSavePortfolioAnalysis();
  const del = useDeletePortfolioAnalysis();

  const [running, setRunning] = useState<"claude" | "gemma" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const latest = analyses?.[0];

  const canRun = positions.length > 0 && totalValue > 0;

  async function run(provider: "claude" | "gemma") {
    if (!canRun || running) return;
    setRunning(provider);
    setError(null);
    try {
      const snapshot = buildSnapshot(positions, totalValue);
      const body: PortfolioAnalysisBody = {
        holdings: snapshot,
        total_value: totalValue,
        portfolio_name: portfolioName,
      };
      const result =
        provider === "claude"
          ? await portfolioAnalysisApi.claude(body)
          : await portfolioAnalysisApi.gemma(body);

      const saved = await save.mutateAsync({
        portfolio_id: portfolioId,
        provider,
        model: result.model,
        holdings_snapshot: snapshot,
        total_value: totalValue,
        total_cost: totalCost,
        analysis: result.analysis,
        summary: result.structured
          ? { structured: result.structured, risk_context: result.risk_context ?? null }
          : null,
        prompt: result.prompt,
      });
      setExpandedId(saved.id);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Analysis failed — please try again.";
      setError(msg);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="card-title">AI Portfolio Risk Analysis</span>
          <span className="text-[10px] text-muted-foreground">
            Bridgewater All-Weather · grounded on local quant data
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run("claude")}
            disabled={!canRun || !!running}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Run analysis via Anthropic Claude"
          >
            {running === "claude" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Claude
          </button>
          <button
            onClick={() => run("gemma")}
            disabled={!canRun || !!running}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-foreground rounded-lg hover:bg-accent/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Run analysis via local Gemma (vLLM)"
          >
            {running === "gemma" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cpu className="w-3.5 h-3.5" />
            )}
            Gemma
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {!canRun && (
          <div className="text-xs text-muted-foreground">
            Add at least one investment with a live price to run a risk analysis.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {running && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Running {running === "claude" ? "Claude" : "Gemma"} risk analysis —
            this can take up to a minute…
          </div>
        )}

        {latest ? (
          <AnalysisBlock
            analysis={latest}
            isLatest
            expanded={expandedId === latest.id || expandedId === null}
            onToggle={() =>
              setExpandedId(expandedId === latest.id ? -1 : latest.id)
            }
            onDelete={() => {
              if (confirm("Delete this analysis?")) del.mutate(latest.id);
            }}
          />
        ) : !isLoading && !running ? (
          <div className="text-xs text-muted-foreground">
            No analyses yet — click Claude or Gemma above to generate one.
          </div>
        ) : null}

        {analyses && analyses.length > 1 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground pb-2">
              History
            </div>
            <div className="space-y-2">
              {analyses.slice(1).map((a) => (
                <AnalysisBlock
                  key={a.id}
                  analysis={a}
                  expanded={expandedId === a.id}
                  onToggle={() =>
                    setExpandedId(expandedId === a.id ? null : a.id)
                  }
                  onDelete={() => {
                    if (confirm("Delete this analysis?")) del.mutate(a.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisBlock({
  analysis,
  isLatest = false,
  expanded,
  onToggle,
  onDelete,
}: {
  analysis: PortfolioAnalysis;
  isLatest?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const dt = useMemo(() => new Date(analysis.created_at), [analysis.created_at]);
  const snapshot = analysis.holdings_snapshot || [];
  const providerLabel =
    analysis.provider === "claude" ? "Claude" : "Gemma (local)";

  const providerTint =
    analysis.provider === "claude"
      ? "bg-primary/15 text-primary border-primary/30"
      : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";

  const structured = (analysis.summary as any)?.structured as
    | StructuredAnalysis
    | undefined;
  const riskContext = (analysis.summary as any)?.risk_context as
    | Record<string, unknown>
    | undefined;

  return (
    <div
      className={`rounded-lg overflow-hidden border transition-colors ${
        isLatest
          ? "border-primary/40 shadow-[0_0_0_1px_rgba(var(--primary-rgb,99,102,241),0.15)]"
          : "border-border/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-accent/20 border-b border-border/30">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${providerTint}`}
          >
            {providerLabel}
          </span>
          {isLatest && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30 flex-shrink-0">
              LATEST
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
            <Clock className="w-3 h-3" />
            {dt.toLocaleString()}
          </span>
          {analysis.total_value != null && (
            <span className="text-[10px] text-muted-foreground truncate">
              · ${Math.round(analysis.total_value).toLocaleString()} ·{" "}
              {snapshot.length} position{snapshot.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
        <button
          onClick={onDelete}
          className="text-muted-foreground/40 hover:text-red-500 transition-colors flex-shrink-0"
          title="Delete analysis"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4 bg-background/40">
          {snapshot.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none">
                <ChevronDown className="w-3 h-3 group-open:rotate-0 -rotate-90 transition-transform" />
                Positions snapshot at analysis time
              </summary>
              <div className="mt-2 overflow-x-auto rounded-lg border border-border/30">
                <table className="w-full text-[11px] tabular-nums">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-muted-foreground bg-accent/30">
                      <th className="text-left px-2.5 py-1.5">Ticker</th>
                      <th className="text-left px-2.5 py-1.5 hidden md:table-cell">Sector</th>
                      <th className="text-right px-2.5 py-1.5">Shares</th>
                      <th className="text-right px-2.5 py-1.5">Price</th>
                      <th className="text-right px-2.5 py-1.5">Value</th>
                      <th className="text-right px-2.5 py-1.5">Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {snapshot.map((h) => (
                      <tr key={h.ticker} className="hover:bg-accent/10 transition-colors">
                        <td className="px-2.5 py-1.5 font-mono font-semibold text-primary">
                          {h.ticker}
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground hidden md:table-cell">
                          {h.sector || "—"}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {h.shares}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {h.current_price != null
                            ? `$${h.current_price.toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          ${Math.round(h.mkt_value).toLocaleString()}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-semibold">
                          {h.weight_pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {structured ? (
            <StructuredMemo structured={structured} riskContext={riskContext} raw={analysis.analysis} />
          ) : (
            <MemoMarkdown source={analysis.analysis} />
          )}

          {analysis.model && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/20 text-[10px] text-muted-foreground/70">
              <span className="font-mono">model: {analysis.model}</span>
              <span>{analysis.analysis.length.toLocaleString()} chars</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Structured memo renderer ──────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  normal: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  elevated: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

function SeverityPill({ severity }: { severity: string }) {
  const cls = SEVERITY_STYLES[severity] || SEVERITY_STYLES.normal;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${cls}`}
    >
      {severity}
    </span>
  );
}

function StructuredMemo({
  structured,
  riskContext,
  raw,
}: {
  structured: StructuredAnalysis;
  riskContext?: Record<string, unknown>;
  raw: string;
}) {
  return (
    <div className="space-y-5">
      {structured.summary_headline && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm font-semibold text-foreground">
          {structured.summary_headline}
        </div>
      )}

      {structured.risk_dashboard?.length > 0 && (
        <Section icon={<ShieldAlert className="w-3.5 h-3.5" />} title="Risk Dashboard">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {structured.risk_dashboard.map((row, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border/40 bg-background/50 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {row.metric}
                  </div>
                  <div className="text-lg font-mono font-semibold text-foreground mt-0.5">
                    {row.value}
                  </div>
                  {row.note && (
                    <div className="text-[11px] text-muted-foreground mt-1">{row.note}</div>
                  )}
                </div>
                <SeverityPill severity={row.severity} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {structured.position_risks?.length > 0 && (
        <Section icon={<Activity className="w-3.5 h-3.5" />} title="Position-Level Risk">
          <div className="overflow-x-auto rounded-lg border border-border/30">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-muted-foreground bg-accent/30">
                  <th className="text-left px-2.5 py-1.5">Ticker</th>
                  <th className="text-right px-2.5 py-1.5">Beta</th>
                  <th className="text-right px-2.5 py-1.5">Ann Vol</th>
                  <th className="text-right px-2.5 py-1.5">Max DD (10y)</th>
                  <th className="text-left px-2.5 py-1.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {structured.position_risks.map((p) => (
                  <tr key={p.ticker} className="hover:bg-accent/10">
                    <td className="px-2.5 py-1.5 font-mono font-semibold text-primary">
                      {p.ticker}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono">
                      {p.beta ?? "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono">
                      {p.ann_vol_pct != null ? `${p.ann_vol_pct}%` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-red-400">
                      {p.max_drawdown_pct != null ? `${p.max_drawdown_pct}%` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground/80">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {structured.portfolio_risks?.length > 0 && (
        <Section icon={<ShieldAlert className="w-3.5 h-3.5" />} title="Portfolio-Level Risks">
          <div className="space-y-2">
            {structured.portfolio_risks.map((r, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border/40 bg-background/50 flex items-start gap-3"
              >
                <SeverityPill severity={r.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground">{r.title}</div>
                  <div className="text-xs text-foreground/80 mt-0.5">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {structured.stress_test?.length > 0 && (
        <Section icon={<Activity className="w-3.5 h-3.5" />} title="Stress Test Replay">
          <div className="overflow-x-auto rounded-lg border border-border/30">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-muted-foreground bg-accent/30">
                  <th className="text-left px-2.5 py-1.5">Scenario</th>
                  <th className="text-right px-2.5 py-1.5">Portfolio</th>
                  <th className="text-right px-2.5 py-1.5">SPY</th>
                  <th className="text-left px-2.5 py-1.5">Interpretation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {structured.stress_test.map((s, i) => (
                  <tr key={i} className="hover:bg-accent/10">
                    <td className="px-2.5 py-1.5 font-medium">{s.scenario}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-red-400">
                      {s.portfolio_return_pct != null ? `${s.portfolio_return_pct}%` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-muted-foreground">
                      {s.spy_return_pct != null ? `${s.spy_return_pct}%` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground/80">
                      {s.interpretation || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {structured.hedges?.length > 0 && (
        <Section icon={<Target className="w-3.5 h-3.5" />} title="Recommended Hedges">
          <div className="space-y-2">
            {structured.hedges.map((h, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border/40 bg-background/50"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-semibold text-primary">{h.strategy}</div>
                  {h.sizing && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-accent/30 px-2 py-0.5 rounded">
                      {h.sizing}
                    </span>
                  )}
                </div>
                <div className="text-xs text-foreground/80 mt-1">{h.rationale}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {structured.verdict && (
        <div className="p-3 rounded-lg bg-accent/20 border-l-2 border-primary/50 text-sm text-foreground/90 leading-relaxed">
          {structured.verdict}
        </div>
      )}

      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer list-none text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none">
          <ChevronDown className="w-3 h-3 group-open:rotate-0 -rotate-90 transition-transform" />
          <FileText className="w-3 h-3" />
          Raw model output
        </summary>
        <div className="mt-2">
          <MemoMarkdown source={"```json\n" + raw + "\n```"} />
        </div>
      </details>

      {riskContext && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none">
            <ChevronDown className="w-3 h-3 group-open:rotate-0 -rotate-90 transition-transform" />
            Quant risk-context fed to model
          </summary>
          <pre className="mt-2 p-3 text-[10px] rounded-lg border border-border/30 bg-muted/30 overflow-x-auto">
            {JSON.stringify(riskContext, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Markdown renderer (fallback when structured parse fails) ──

const MEMO_CLASS = [
  "text-sm text-foreground/90 leading-relaxed space-y-3",
  "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:tracking-tight [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:tracking-tight [&_h2]:mt-5 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border/40",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-primary [&_h3]:mt-4 [&_h3]:mb-1.5",
  "[&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-foreground/90 [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:mt-3",
  "[&_p]:my-1.5",
  "[&_strong]:text-foreground [&_strong]:font-semibold",
  "[&_em]:text-foreground/80",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:my-1.5 [&_ul_ul]:mt-1",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:my-1.5",
  "[&_li]:marker:text-muted-foreground/60",
  "[&_code]:bg-muted/60 [&_code]:text-primary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_code]:font-mono",
  "[&_pre]:bg-muted/40 [&_pre]:border [&_pre]:border-border/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-[11px]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-foreground/90",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-foreground/75 [&_blockquote]:my-3",
  "[&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline",
  "[&_hr]:my-4 [&_hr]:border-border/40",
  "[&_table]:w-full [&_table]:text-[12px] [&_table]:border-collapse [&_table]:tabular-nums [&_table]:my-3 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-border/40",
  "[&_thead]:bg-accent/30",
  "[&_th]:text-left [&_th]:font-semibold [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:border-b [&_th]:border-border/40",
  "[&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_td]:border-b [&_td]:border-border/20",
  "[&_tbody_tr:last-child_td]:border-b-0",
  "[&_tbody_tr:nth-child(even)]:bg-accent/10",
  "[&_tbody_tr:hover]:bg-accent/20",
].join(" ");

function MemoMarkdown({ source }: { source: string }) {
  return (
    <div className={MEMO_CLASS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
