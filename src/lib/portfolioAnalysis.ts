/**
 * Shared types and prompt builder for the All-Weather / Bridgewater-style
 * portfolio risk analysis, used by both the Claude and Gemma routes.
 *
 * Both providers receive the SAME risk_context block (computed on DGX via
 * /api/portfolio/risk-context) and the SAME schema, so outputs are directly
 * comparable rather than drifting due to prompt differences.
 */

export type HoldingSnapshot = {
  ticker: string;
  name?: string;
  sector?: string;
  shares: number;
  cost_basis: number;
  current_price?: number;
  mkt_value: number;
  weight_pct: number;
};

export type AnalysisProvider = "claude" | "gemma";

export type RiskDashboardRow = {
  metric: string;
  value: string;
  severity: "normal" | "elevated" | "high" | "critical";
  note?: string;
};

export type PositionRisk = {
  ticker: string;
  beta?: number | null;
  ann_vol_pct?: number | null;
  max_drawdown_pct?: number | null;
  notes?: string;
};

export type PortfolioRisk = {
  title: string;
  severity: "normal" | "elevated" | "high" | "critical";
  detail: string;
};

export type StressTestRow = {
  scenario: string;
  portfolio_return_pct?: number | null;
  spy_return_pct?: number | null;
  interpretation?: string;
};

export type Hedge = {
  strategy: string;
  rationale: string;
  sizing?: string;
};

export type StructuredAnalysis = {
  summary_headline: string;
  risk_dashboard: RiskDashboardRow[];
  position_risks: PositionRisk[];
  portfolio_risks: PortfolioRisk[];
  stress_test: StressTestRow[];
  hedges: Hedge[];
  verdict: string;
};

export const PORTFOLIO_ANALYSIS_SYSTEM = `You are a senior portfolio risk analyst at Bridgewater Associates trained in Ray Dalio's All Weather principles.

You are given:
  1. A holdings table (positions, weights, cost basis, market value).
  2. A risk_context block with PRE-COMPUTED statistics from a local quant database
     (beta vs SPY, realized + GARCH vol, 10y max drawdown, 52w range, avg volume,
     sector concentration, pairwise correlations, and historical stress-test replays).

STRICT RULES
  - Use ONLY the numbers in risk_context. Never invent betas, vols, drawdowns, correlations, or returns.
  - If a statistic is null or missing, say "n/a" — do not estimate.
  - Stress-test returns (COVID, 2022 bear) come directly from risk_context.stress_replay.
  - Interest-rate and earnings-date commentary can be qualitative (the context doesn't carry these),
    but label them clearly as qualitative.
  - Hedging suggestions must be concrete instruments (SPY puts, VIX calls, inverse ETFs,
    sector shorts) with rough sizing as % of portfolio notional.

OUTPUT FORMAT
Return ONLY a JSON object matching this schema (no prose before/after, no code fences):

{
  "summary_headline": "one-sentence top-line verdict",
  "risk_dashboard": [
    {"metric": "Portfolio Beta vs SPY", "value": "1.30", "severity": "normal|elevated|high|critical", "note": "short context"}
  ],
  "position_risks": [
    {"ticker": "AAPL", "beta": 1.01, "ann_vol_pct": 22.8, "max_drawdown_pct": -38.5, "notes": "specific risk call-out"}
  ],
  "portfolio_risks": [
    {"title": "Sector concentration", "severity": "high", "detail": "75% Technology — single-factor exposure"}
  ],
  "stress_test": [
    {"scenario": "COVID crash", "portfolio_return_pct": -35.0, "spy_return_pct": -33.7, "interpretation": "..."}
  ],
  "hedges": [
    {"strategy": "SPY Jan puts 5% OTM", "rationale": "...", "sizing": "~2% of notional"}
  ],
  "verdict": "2-4 sentence actionable conclusion"
}

Severity scale:
  normal      — within expected range
  elevated    — worth monitoring
  high        — actionable risk
  critical    — immediate attention
`;

export function formatHoldingsForPrompt(
  holdings: HoldingSnapshot[],
  totalValue: number,
): string {
  const lines: string[] = [];
  lines.push(`Total portfolio value: $${Math.round(totalValue).toLocaleString()}`);
  lines.push("");
  lines.push("Holdings (ticker | shares | avg cost | price | market value | weight):");
  for (const h of holdings) {
    lines.push(
      `- ${h.ticker}${h.name ? ` (${h.name})` : ""}${h.sector ? ` [${h.sector}]` : ""} | ` +
        `${h.shares} sh | $${h.cost_basis.toFixed(2)} | ` +
        `${h.current_price != null ? `$${h.current_price.toFixed(2)}` : "n/a"} | ` +
        `$${Math.round(h.mkt_value).toLocaleString()} | ${h.weight_pct.toFixed(1)}%`,
    );
  }
  return lines.join("\n");
}

export function buildPortfolioAnalysisPrompt(
  holdings: HoldingSnapshot[],
  totalValue: number,
  riskContext: unknown,
  portfolioName?: string,
): string {
  const holdingsBlock = formatHoldingsForPrompt(holdings, totalValue);
  const header = portfolioName ? `Portfolio: ${portfolioName}\n\n` : "";
  return (
    `${PORTFOLIO_ANALYSIS_SYSTEM}\n\n` +
    `${header}${holdingsBlock}\n\n` +
    `risk_context (authoritative — use these numbers, do not invent):\n` +
    `\`\`\`json\n${JSON.stringify(riskContext, null, 2)}\n\`\`\`\n\n` +
    `Now return the JSON object per the schema. JSON only, no prose.`
  );
}

/** Best-effort JSON extractor for LLM replies that may wrap JSON in code fences or prose. */
export function extractJson<T = unknown>(text: string): T | null {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (stripped.startsWith("{")) {
    try {
      return JSON.parse(stripped) as T;
    } catch {
      /* fall through */
    }
  }
  const fenceMatch = stripped.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {
      /* fall through */
    }
  }
  const braceMatch = stripped.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as T;
    } catch {
      return null;
    }
  }
  return null;
}
