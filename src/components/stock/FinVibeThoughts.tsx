"use client";
import { useState } from "react";
import { Brain, RefreshCw, ChevronDown, ChevronUp, Shield, Target, AlertTriangle } from "lucide-react";
import { MarketDirectionCard } from "./MarketDirectionCard";
import { stocksApi } from "@/lib/api";

interface FinVibeThoughtsProps {
  ticker: string;
  thoughts: any | null;
  generatedAt: string | null;
  llmIntrinsicValue?: number | null;
  llmMarginOfSafety?: number | null;
}

function Section({ title, content, defaultOpen = false }: { title: string; content: string | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  return (
    <div className="border-b border-border/20 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left hover:bg-accent/50 transition-colors px-1"
      >
        <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="pb-3 px-1">
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{content}</p>
        </div>
      )}
    </div>
  );
}

export function FinVibeThoughts({
  ticker,
  thoughts,
  generatedAt,
  llmIntrinsicValue,
  llmMarginOfSafety,
}: FinVibeThoughtsProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await stocksApi.generateThoughts(ticker);
    } catch {
      // ignore — user can retry
    } finally {
      setTimeout(() => setIsGenerating(false), 3000);
    }
  }

  if (!thoughts) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground/80">FinVibe&apos;s Thoughts</h2>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />
            {isGenerating ? "Generating..." : "Generate Analysis"}
          </button>
        </div>
        <div className="py-8 text-center text-muted-foreground text-sm">
          <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No analysis available yet. Click &quot;Generate Analysis&quot; to create one.
        </div>
      </div>
    );
  }

  const verdict = thoughts.verdict || "hold";
  const conviction = thoughts.conviction || "medium";

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground/80">FinVibe&apos;s Thoughts</h2>
          {generatedAt && (
            <span className="text-[10px] text-muted-foreground/60">
              Updated {new Date(generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-muted-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Verdict Banner */}
      <div
        className={`rounded-lg p-4 mb-4 ${
          verdict === "buy"
            ? "bg-green-500/10 border border-green-500/20"
            : verdict === "avoid"
            ? "bg-red-500/10 border border-red-500/20"
            : "bg-yellow-500/10 border border-yellow-500/20"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {verdict === "buy" ? (
              <Target className="w-5 h-5 text-green-400" />
            ) : verdict === "avoid" ? (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            ) : (
              <Shield className="w-5 h-5 text-yellow-400" />
            )}
            <div>
              <span
                className={`text-sm font-bold uppercase ${
                  verdict === "buy"
                    ? "text-green-400"
                    : verdict === "avoid"
                    ? "text-red-400"
                    : "text-yellow-400"
                }`}
              >
                {verdict}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                Conviction: {conviction}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {llmIntrinsicValue != null && (
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">Intrinsic (AI)</div>
                <span className="font-mono text-sm text-blue-400">
                  ${llmIntrinsicValue.toFixed(2)}
                </span>
              </div>
            )}
            {llmMarginOfSafety != null && (
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">MoS (AI)</div>
                <span
                  className={`font-mono text-sm ${
                    llmMarginOfSafety > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {(llmMarginOfSafety * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Market Direction Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {thoughts.short_term && (
          <MarketDirectionCard
            horizon={thoughts.short_term.horizon || "1 Month"}
            direction={thoughts.short_term.direction || "neutral"}
            priceAction={thoughts.short_term.price_action || ""}
          />
        )}
        {thoughts.mid_term && (
          <MarketDirectionCard
            horizon={thoughts.mid_term.horizon || "6 Months"}
            direction={thoughts.mid_term.direction || "neutral"}
            priceAction={thoughts.mid_term.price_action || ""}
          />
        )}
        {thoughts.long_term && (
          <MarketDirectionCard
            horizon={thoughts.long_term.horizon || "12+ Months"}
            direction={thoughts.long_term.direction || "neutral"}
            priceAction={thoughts.long_term.price_action || ""}
          />
        )}
      </div>

      {/* Bull/Bear Cases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {thoughts.bull_case && (
          <div className="border border-green-500/20 bg-green-500/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Bull Case</span>
              {thoughts.bull_case.price_target_12m != null && (
                <span className="font-mono text-xs text-green-400">
                  PT: ${Number(thoughts.bull_case.price_target_12m).toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{thoughts.bull_case.narrative}</p>
          </div>
        )}
        {thoughts.bear_case && (
          <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Bear Case</span>
              {thoughts.bear_case.price_target_12m != null && (
                <span className="font-mono text-xs text-red-400">
                  PT: ${Number(thoughts.bear_case.price_target_12m).toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{thoughts.bear_case.narrative}</p>
          </div>
        )}
      </div>

      {/* Competitive Advantages */}
      {thoughts.competitive_advantages && typeof thoughts.competitive_advantages === "object" && (
        <div className="mb-4 bg-accent/30 border border-border/30 rounded-lg p-4">
          <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">
            Competitive Advantages
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {["pricing_power", "brand_strength", "switching_costs", "network_effects"].map((key) => {
              const val = thoughts.competitive_advantages[key];
              if (val == null || typeof val !== "number") return null;
              return (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-muted-foreground capitalize mb-1">
                    {key.replace(/_/g, " ")}
                  </div>
                  <div className="flex items-center justify-center gap-0.5">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-sm ${
                          i < val ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-xs font-mono text-foreground/80 mt-0.5">{val}/10</div>
                </div>
              );
            })}
          </div>
          {thoughts.competitive_advantages.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {thoughts.competitive_advantages.summary}
            </p>
          )}
        </div>
      )}

      {/* Expandable Analysis Sections */}
      <div>
        <Section title="Moat Analysis" content={thoughts.moat_analysis} defaultOpen />
        <Section title="Business Model" content={thoughts.business_model} />
        <Section title="Revenue Streams" content={thoughts.revenue_streams} />
        <Section title="Profitability" content={thoughts.profitability} />
        <Section title="Balance Sheet" content={thoughts.balance_sheet} />
        <Section title="Free Cash Flow" content={thoughts.fcf_analysis} />
        <Section title="Management Quality" content={thoughts.management_quality} />
        <Section title="Valuation Snapshot" content={thoughts.valuation_snapshot} />
      </div>
    </div>
  );
}
