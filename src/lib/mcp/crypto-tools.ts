/**
 * Crypto module MCP tools. Registered from tools.ts in one line and skipped
 * when the module is switched off. Fetches go straight to the box's
 * /api/crypto-desk routes; the readings come composed from there.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceSupabase } from "@/lib/supabase/service";
import { dgxJson } from "@/lib/mcp/market";
import { toolByName } from "@/lib/mcp/catalog";
import { CRYPTO_MODULE_ENABLED, isCryptoTicker } from "@/modules/crypto/flag";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function meta(name: string) {
  const doc = toolByName(name);
  if (!doc) throw new Error(`Missing catalog entry for tool ${name}`);
  return { title: doc.title, description: doc.description };
}

export function registerCryptoTools(reg: McpServer["registerTool"], ctx: { userId: string; supabase: ServiceSupabase }) {
  if (!CRYPTO_MODULE_ENABLED) return;

  reg(
    "get_crypto_reading",
    { ...meta("get_crypto_reading"), inputSchema: { timeframe: z.enum(["1h", "4h", "1d", "1w"]).optional() } },
    async (args) => {
      const tf = args.timeframe ?? "4h";
      const [reading, liquidity] = await Promise.all([
        dgxJson<Record<string, unknown>>(`/api/crypto-desk/btc/reading?timeframe=${tf}`),
        dgxJson<Record<string, unknown>>(`/api/crypto-desk/btc/liquidity?timeframe=${tf}`).catch(() => null),
      ]);
      return ok({
        ...reading,
        liquidity: liquidity
          ? { pools: liquidity.liquidity_pools, order_blocks: liquidity.order_blocks, fvgs: liquidity.fvgs, premium_discount: liquidity.premium_discount, generated_at: liquidity.generated_at }
          : null,
      });
    },
  );

  reg(
    "get_crypto_tickers",
    { ...meta("get_crypto_tickers"), inputSchema: { symbols: z.array(z.string().min(1)).max(50).optional() } },
    async (args) => {
      let symbols = (args.symbols ?? []).map((s) => s.toUpperCase());
      if (!symbols.length) {
        const { data } = await ctx.supabase
          .from("watchlist_items")
          .select("stock_catalog(ticker), watchlists!inner(user_id)")
          .eq("watchlists.user_id", ctx.userId);
        const set = new Set<string>();
        for (const it of (data ?? []) as Array<{ stock_catalog?: { ticker?: string } | null }>) {
          const t = it.stock_catalog?.ticker?.toUpperCase();
          if (t && isCryptoTicker(t)) set.add(t);
        }
        symbols = [...set].sort();
      }
      if (!symbols.length) return ok({ tickers: {}, missing: [], note: "No coins on the token's watchlists; pass symbols to query any coin." });
      return ok(await dgxJson<unknown>(`/api/crypto-desk/coins/ticker?symbols=${encodeURIComponent(symbols.join(","))}`));
    },
  );
}
