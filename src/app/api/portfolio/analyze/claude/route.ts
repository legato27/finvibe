import { NextRequest, NextResponse } from "next/server";
import {
  buildPortfolioAnalysisPrompt,
  type HoldingSnapshot,
} from "@/lib/portfolioAnalysis";

export const maxDuration = 120;

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

type Body = {
  holdings: HoldingSnapshot[];
  total_value: number;
  portfolio_name?: string;
};

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

  const prompt = buildPortfolioAnalysisPrompt(
    body.holdings,
    body.total_value,
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
        max_tokens: 4096,
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

    return NextResponse.json({
      analysis,
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
