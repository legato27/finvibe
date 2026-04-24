"use client";
import { useMemo, useState } from "react";
import ReactMarkdownRaw from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles, Cpu, Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Clock, Trash2,
} from "lucide-react";
import { portfolioAnalysisApi, type PortfolioAnalysisBody } from "@/lib/api";
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
          <span className="text-[10px] text-muted-foreground">Bridgewater All-Weather memo</span>
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

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-accent/20">
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
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
              analysis.provider === "claude"
                ? "bg-primary/20 text-primary"
                : "bg-accent text-foreground"
            }`}
          >
            {providerLabel}
          </span>
          {isLatest && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-green-500/20 text-green-500 flex-shrink-0">
              LATEST
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
            <Clock className="w-3 h-3" />
            {dt.toLocaleString()}
          </span>
          {analysis.total_value != null && (
            <span className="text-[10px] text-muted-foreground truncate">
              · $
              {Math.round(analysis.total_value).toLocaleString()} ·{" "}
              {snapshot.length} position{snapshot.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
        <button
          onClick={onDelete}
          className="text-muted-foreground/40 hover:text-red-500 transition-colors"
          title="Delete analysis"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {snapshot.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                    <th className="text-left px-2 py-1">Ticker</th>
                    <th className="text-right px-2 py-1">Shares</th>
                    <th className="text-right px-2 py-1">Price</th>
                    <th className="text-right px-2 py-1">Value</th>
                    <th className="text-right px-2 py-1">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {snapshot.map((h) => (
                    <tr key={h.ticker}>
                      <td className="px-2 py-1 font-mono font-semibold text-primary">
                        {h.ticker}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {h.shares}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {h.current_price != null
                          ? `$${h.current_price.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        ${Math.round(h.mkt_value).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {h.weight_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground/90 [&_table]:text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h2]:mt-4 [&_h3]:mt-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {analysis.analysis}
            </ReactMarkdown>
          </div>

          {analysis.model && (
            <div className="text-[10px] text-muted-foreground/60 font-mono pt-1 border-t border-border/20">
              model: {analysis.model}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
