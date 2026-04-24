import { NextRequest, NextResponse } from "next/server";
import {
  buildPortfolioAnalysisPrompt,
  extractJson,
  type HoldingSnapshot,
  type StructuredAnalysis,
} from "@/lib/portfolioAnalysis";

export const maxDuration = 180;

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DGX_API_URL = process.env.DGX_API_URL || "https://api.vibelife.sg";

type Body = {
  holdings: HoldingSnapshot[];
  total_value: number;
  portfolio_name?: string;
  risk_context?: unknown;
};

async function fetchRiskContext(holdings: HoldingSnapshot[]): Promise<unknown> {
  const resp = await fetch(`${DGX_API_URL}/api/portfolio/risk-context`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ holdings }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    throw new Error(`risk-context failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.holdings?.length) {
    return NextResponse.json(
      { error: "At least one holding is required." },
      { status: 400 },
    );
  }

  let riskContext: unknown;
  try {
    riskContext = body.risk_context ?? (await fetchRiskContext(body.holdings));
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not compute risk context: ${e?.message ?? "unknown"}` },
      { status: 502 },
    );
  }

  const prompt = buildPortfolioAnalysisPrompt(
    body.holdings,
    body.total_value,
    riskContext,
    body.portfolio_name,
  );

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return NextResponse.json(
        { error: `Claude API error (${resp.status}): ${detail.slice(0, 500)}` },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const analysis = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    if (!analysis) {
      return NextResponse.json(
        { error: "Claude returned an empty response." },
        { status: 502 },
      );
    }

    const structured = extractJson<StructuredAnalysis>(analysis);

    return NextResponse.json({
      analysis,
      structured,
      risk_context: riskContext,
      model: data?.model || CLAUDE_MODEL,
      prompt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Claude call failed: ${e?.message ?? "unknown error"}` },
      { status: 502 },
    );
  }
}
