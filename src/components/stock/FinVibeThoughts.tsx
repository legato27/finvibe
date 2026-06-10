"use client";
import { useEffect, useRef, useState } from "react";
import { Brain, RefreshCw, ChevronDown, ChevronUp, Shield, Target, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { MarketDirectionCard } from "./MarketDirectionCard";
import { stocksApi } from "@/lib/api";

interface FinVibeThoughtsProps {
  ticker: string;
  thoughts: any | null;
  generatedAt: string | null;
  isGenerating?: boolean;
  onGenerate?: () => void;
  onGenerateDone?: () => void;
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
  isGenerating = false,
  onGenerate,
  onGenerateDone,
  llmIntrinsicValue,
  llmMarginOfSafety,
}: FinVibeThoughtsProps) {
  const t = useTranslations('stock');
  const tpa = useTranslations('priceAction');
  const [localGenerating, setLocalGenerating] = useState(false);
  // generatedAt at the moment generation started. Completion = a NEWER timestamp arrives.
  // The old `!thoughts` check never cleared the spinner when re-generating an analysis that
  // already existed (thoughts stayed truthy), leaving it spinning forever.
  const genStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!localGenerating) return;
    if (thoughts && generatedAt !== genStartedAtRef.current) {
      setLocalGenerating(false);
      onGenerateDone?.();
    }
  }, [thoughts, generatedAt, localGenerating, onGenerateDone]);

  const generating = isGenerating || localGenerating;

  async function handleGenerate() {
    genStartedAtRef.current = generatedAt; // snapshot so we can detect the new analysis
    setLocalGenerating(true);
    onGenerate?.();
    try {
      await stocksApi.generateThoughts(ticker);
    } catch {
      setLocalGenerating(false);
      onGenerateDone?.();
    }
  }

  if (!thoughts) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground/80">{t('finvibeThoughts')}</h2>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} />
            {generating ? t('generating') : t('generateAnalysis')}
          </button>
        </div>
        <div className="py-8 text-center text-muted-foreground text-sm">
          <Brain className={`w-10 h-10 mx-auto mb-2 ${generating ? "opacity-60 animate-pulse" : "opacity-30"}`} />
          {generating ? t('analysisInProgress') : t('noAnalysisYet')}
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
          <h2 className="text-sm font-semibold text-foreground/80">{t('finvibeThoughts')}</h2>
          {generatedAt && (
            <span className="text-[10px] text-muted-foreground/60">
              {t('updatedDate', { date: new Date(generatedAt).toLocaleDateString() })}
            </span>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-muted-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} />
          {generating ? t('generating') : t('refresh')}
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
              <Target className="w-5 h-5 text-signal-long" />
            ) : verdict === "avoid" ? (
              <AlertTriangle className="w-5 h-5 text-signal-short" />
            ) : (
              <Shield className="w-5 h-5 text-signal-caution" />
            )}
            <div>
              <span
                className={`text-sm font-bold uppercase ${
                  verdict === "buy"
                    ? "text-signal-long"
                    : verdict === "avoid"
                    ? "text-signal-short"
                    : "text-signal-caution"
                }`}
              >
                {verdict}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {t('convictionLabel', { level: conviction })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {llmIntrinsicValue != null && (
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">{t('intrinsicAi')}</div>
                <span className="font-mono text-sm text-sky-700 dark:text-sky-400">
                  ${llmIntrinsicValue.toFixed(2)}
                </span>
              </div>
            )}
            {llmMarginOfSafety != null && (
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">{t('mosAi')}</div>
                <span
                  className={`font-mono text-sm ${
                    llmMarginOfSafety > 0 ? "text-signal-long" : "text-signal-short"
                  }`}
                >
                  {Number(llmMarginOfSafety).toFixed(1)}%
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
            horizon={thoughts.short_term.horizon || t('horizon1m')}
            direction={thoughts.short_term.direction || "neutral"}
            priceAction={thoughts.short_term.price_action || ""}
          />
        )}
        {thoughts.mid_term && (
          <MarketDirectionCard
            horizon={thoughts.mid_term.horizon || t('horizon6m')}
            direction={thoughts.mid_term.direction || "neutral"}
            priceAction={thoughts.mid_term.price_action || ""}
          />
        )}
        {thoughts.long_term && (
          <MarketDirectionCard
            horizon={thoughts.long_term.horizon || t('horizon12mPlus')}
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
              <span className="text-xs font-semibold text-signal-long uppercase tracking-wider">{t('bullCase')}</span>
              {thoughts.bull_case.price_target_12m != null && (
                <span className="font-mono text-xs text-signal-long">
                  {t('priceTargetShort', { value: Number(thoughts.bull_case.price_target_12m).toFixed(2) })}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{thoughts.bull_case.narrative}</p>
          </div>
        )}
        {thoughts.bear_case && (
          <div className="border border-red-500/20 bg-red-500/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-signal-short uppercase tracking-wider">{t('bearCase')}</span>
              {thoughts.bear_case.price_target_12m != null && (
                <span className="font-mono text-xs text-signal-short">
                  {t('priceTargetShort', { value: Number(thoughts.bear_case.price_target_12m).toFixed(2) })}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{thoughts.bear_case.narrative}</p>
          </div>
        )}
      </div>

      {/* Devil's advocate — adversarial second pass over this report */}
      {thoughts.critique_note && (
        <section
          aria-label={t("devilsAdvocate")}
          className="mb-4 rounded-lg border border-signal-conflict/40 bg-signal-conflict-bg p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal-conflict">
              {t("devilsAdvocate")}
            </span>
            {thoughts.critique_stance_change && thoughts.critique_stance_change !== "none" && (
              <span className="rounded border border-signal-conflict/40 px-1.5 py-0.5 text-xs text-signal-conflict">
                {t(`critiqueStance.${thoughts.critique_stance_change}`)}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{thoughts.critique_note}</p>
        </section>
      )}

      {/* Price Action setup (PAM — pure price action, no R:R) */}
      {thoughts.price_action && typeof thoughts.price_action === "object" && (
        <div className="mb-4 bg-accent/30 border border-border/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
              {tpa('cardTitle')}
            </div>
            {thoughts.price_action.setup && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                {String(thoughts.price_action.setup)}
              </span>
            )}
          </div>
          {thoughts.price_action.structure && (
            <p className="text-xs text-foreground/80 mb-3">{String(thoughts.price_action.structure)}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {thoughts.price_action.entry_zone != null && thoughts.price_action.entry_zone !== "" && (
              <div className="col-span-2 md:col-span-1">
                <div className="text-[10px] text-muted-foreground mb-0.5">{tpa('entryZone')}</div>
                <div className="font-mono text-foreground/90">{String(thoughts.price_action.entry_zone)}</div>
              </div>
            )}
            {typeof thoughts.price_action.invalidation === "number" && thoughts.price_action.invalidation > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">{tpa('invalidation')}</div>
                <div className="font-mono text-signal-short">
                  ${thoughts.price_action.invalidation.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
            {Array.isArray(thoughts.price_action.targets) && thoughts.price_action.targets.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">{tpa('targets')}</div>
                <div className="font-mono text-signal-long">
                  {thoughts.price_action.targets
                    .filter((x: any) => typeof x === "number" && x > 0)
                    .map((x: number) => `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                    .join(" · ")}
                </div>
              </div>
            )}
            {thoughts.price_action.conviction && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">{tpa('conviction')}</div>
                <div className="font-mono text-foreground/90 capitalize">{String(thoughts.price_action.conviction)}</div>
              </div>
            )}
          </div>
          {thoughts.price_action.trigger && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-3">
              <span className="text-foreground/70">{tpa('trigger')}: </span>
              {String(thoughts.price_action.trigger)}
            </p>
          )}
        </div>
      )}

      {/* Competitive Advantages */}
      {thoughts.competitive_advantages && typeof thoughts.competitive_advantages === "object" && (
        <div className="mb-4 bg-accent/30 border border-border/30 rounded-lg p-4">
          <div className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-3">
            {t('competitiveAdvantages')}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {([
              { key: "pricing_power", label: t('pricingPower') },
              { key: "brand_strength", label: t('brandStrength') },
              { key: "switching_costs", label: t('switchingCosts') },
              { key: "network_effects", label: t('networkEffects') },
            ]).map(({ key, label }) => {
              const val = thoughts.competitive_advantages[key];
              if (val == null || typeof val !== "number") return null;
              return (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-muted-foreground mb-1">
                    {label}
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
        <Section title={t('moatAnalysis')} content={thoughts.moat_analysis} defaultOpen />
        <Section title={t('businessModel')} content={thoughts.business_model} />
        <Section title={t('revenueStreams')} content={thoughts.revenue_streams} />
        <Section title={t('profitability')} content={thoughts.profitability} />
        <Section title={t('balanceSheet')} content={thoughts.balance_sheet} />
        <Section title={t('fcfAnalysis')} content={thoughts.fcf_analysis} />
        <Section title={t('managementQuality')} content={thoughts.management_quality} />
        <Section title={t('valuationSnapshot')} content={thoughts.valuation_snapshot} />
        <Section title={t('peerRelative')} content={thoughts.peer_relative} />
        <Section title={t('analystConsensus')} content={thoughts.analyst_consensus} />
      </div>
    </div>
  );
}
