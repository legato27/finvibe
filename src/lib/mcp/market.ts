// Server-side fetches against the DGX market-data backend.
// Mirrors a slice of src/lib/api.ts but runs from server routes
// (and re-uses the same Cloudflare Access service-token plumbing
// that src/lib/proxy.ts uses).

const DGX_API_URL = process.env.DGX_API_URL;
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

function dgxHeaders(extra?: Record<string, string>): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
  if (CF_ACCESS_CLIENT_ID) h["CF-Access-Client-Id"] = CF_ACCESS_CLIENT_ID;
  if (CF_ACCESS_CLIENT_SECRET) h["CF-Access-Client-Secret"] = CF_ACCESS_CLIENT_SECRET;
  return h;
}

async function dgxJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!DGX_API_URL) throw new Error("DGX_API_URL is not set");
  const res = await fetch(`${DGX_API_URL}${path}`, {
    ...init,
    headers: dgxHeaders(init?.headers as Record<string, string> | undefined),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DGX ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const market = {
  search: (q: string, marketCode?: string) => {
    const params = new URLSearchParams({ q });
    if (marketCode) params.set("market", marketCode);
    return dgxJson<unknown>(`/api/stocks/search?${params.toString()}`);
  },
  info: (ticker: string) =>
    dgxJson<unknown>(`/api/stocks/${encodeURIComponent(ticker)}/info`),
  refreshPrices: (tickers: string[]) =>
    dgxJson<unknown>(`/api/stocks/prices/batch`, {
      method: "POST",
      body: JSON.stringify({ tickers }),
    }),
  generateThoughts: (ticker: string) =>
    dgxJson<unknown>(
      `/api/stocks/${encodeURIComponent(ticker)}/generate-thoughts`,
      { method: "POST" },
    ),
  runAllModels: (ticker: string) =>
    dgxJson<unknown>(
      `/api/models/${encodeURIComponent(ticker)}/run/all`,
      { method: "GET" },
    ),
};

// Kick off the full enrichment pipeline for a set of tickers.
// Errors are swallowed per-stage so one slow/broken backend doesn't
// block the others.
export async function enrichTickers(tickers: string[]): Promise<void> {
  if (!tickers.length) return;
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  // Prices first (single batched call, usually fast).
  await market.refreshPrices(unique).catch((err) => {
    console.error("[mcp enrich] refreshPrices failed", err);
  });

  // Then thoughts + quant models per ticker, in parallel.
  await Promise.allSettled(
    unique.flatMap((ticker) => [
      market.generateThoughts(ticker).catch((err) => {
        console.error(`[mcp enrich] generateThoughts ${ticker} failed`, err);
      }),
      market.runAllModels(ticker).catch((err) => {
        console.error(`[mcp enrich] runAllModels ${ticker} failed`, err);
      }),
    ]),
  );
}
