/**
 * Shared types and prompt builder for the All-Weather / Bridgewater-style
 * portfolio risk analysis, used by both the Claude and Gemma routes.
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

export const PORTFOLIO_ANALYSIS_INSTRUCTION = `You are a senior portfolio risk analyst at Bridgewater Associates trained in Ray Dalio's All Weather principles, managing risk for the world's largest hedge fund with $150B+ in assets.

I need a complete risk assessment of a stock or my portfolio.

Assess:

- Volatility profile: historical and implied volatility vs sector and market averages
- Beta analysis: how much the stock moves relative to the S&P 500 in up and down markets
- Maximum drawdown history: worst peak-to-trough drops over the last 10 years with recovery times
- Correlation analysis: how this stock moves relative to my other holdings
- Sector concentration risk: am I overexposed to one industry or theme
- Interest rate sensitivity: how rising or falling rates impact this stock specifically
- Recession stress test: estimated price decline in a 2008-style or COVID-style crash
- Earnings risk: how much the stock typically moves on earnings day and upcoming catalyst dates
- Liquidity risk: average daily volume and bid-ask spread analysis
- Hedging recommendation: specific options strategies or inverse positions to protect downside

Format as a Bridgewater-style risk memo with a risk dashboard summary table and portfolio-level recommendations.`;

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
  portfolioName?: string,
): string {
  const holdingsBlock = formatHoldingsForPrompt(holdings, totalValue);
  const header = portfolioName ? `Portfolio: ${portfolioName}\n\n` : "";
  return `${PORTFOLIO_ANALYSIS_INSTRUCTION}\n\nMy holdings:\n\n${header}${holdingsBlock}`;
}
