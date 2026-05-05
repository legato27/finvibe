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
};
