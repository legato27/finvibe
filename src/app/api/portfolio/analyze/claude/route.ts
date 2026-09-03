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

// Cloudflare Access service-token headers for the gated DGX backend.
// Mirrors src/lib/proxy.ts so the machine-to-machine hop authenticates when
// api.vibelife.sg sits behind Access. No-ops if the env vars are unset.
function dgxAccessHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (process.env.CF_ACCESS_CLIENT_ID) h["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
  if (process.env.CF_ACCESS_CLIENT_SECRET) h["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  return h;
}

async function fetchRiskContext(holdings: HoldingSnapshot[]): Promise<unknown> {
  const resp = await fetch(`${DGX_API_URL}/api/portfolio/risk-context`, {
    method: "POST",
    headers: dgxAccessHeaders(),
    body: JSON.stringify({ holdings }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    throw new Error(`risk-context failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[portfolio/analyze/claude] missing ANTHROPIC_API_KEY");
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

  console.log(
    `[portfolio/analyze/claude] start model=${CLAUDE_MODEL} holdings=${body.holdings.length} total_value=${body.total_value} portfolio=${body.portfolio_name ?? "-"}`,
  );

  // The statistics block is the one thing here that needs DGX; the model
  // itself runs on Anthropic's API and the holdings came from Supabase. A
  // failed risk-context used to 502 the whole request, which meant an
  // outage on the box took down an analysis that was otherwise entirely
  // independent of it. Now it degrades: the prompt is told the context is
  // unavailable and is barred from inventing the numbers it would have
  // held, and the response says so too.
  let riskContext: unknown = null;
  let riskContextError: string | null = null;
  try {
    riskContext = body.risk_context ?? (await fetchRiskContext(body.holdings));
  } catch (e: any) {
    riskContextError = e?.message ?? "unknown";
    console.error(
      `[portfolio/analyze/claude] risk-context failed after ${elapsed()}ms: ${e?.name ?? "Error"}: ${riskContextError} — continuing without it`,
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
      signal: AbortSignal.timeout(150_000),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error(
        `[portfolio/analyze/claude] anthropic non-ok status=${resp.status} after ${elapsed()}ms body=${detail.slice(0, 500)}`,
      );
      return NextResponse.json(
        { error: `Claude API error (${resp.status}): ${detail.slice(0, 500)}` },
        { status: resp.status >= 500 ? 502 : resp.status },
      );
    }

    const data = await resp.json();
    const analysis = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    if (!analysis) {
      console.error(
        `[portfolio/analyze/claude] empty analysis after ${elapsed()}ms data=${JSON.stringify(data).slice(0, 500)}`,
      );
      return NextResponse.json(
        { error: "Claude returned an empty response." },
        { status: 502 },
      );
    }

    const structured = extractJson<StructuredAnalysis>(analysis);
    console.log(
      `[portfolio/analyze/claude] ok ${elapsed()}ms model=${data?.model ?? CLAUDE_MODEL} chars=${analysis.length} structured=${structured ? "yes" : "no"}`,
    );

    return NextResponse.json({
      analysis,
      structured,
      risk_context: riskContext,
      // Present and non-null only on the degraded path, so a saved analysis
      // carries the reason its statistics are all n/a.
      risk_context_error: riskContextError,
      model: data?.model || CLAUDE_MODEL,
      prompt,
    });
  } catch (e: any) {
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(
      `[portfolio/analyze/claude] exception after ${elapsed()}ms timeout=${isTimeout} name=${e?.name} message=${e?.message}`,
    );
    return NextResponse.json(
      {
        error: isTimeout
          ? `Claude request timed out after ${elapsed()}ms (internal 150s cap).`
          : `Claude call failed: ${e?.message ?? "unknown error"}`,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
