/**
 * Crypto module MCP tools. Registered from tools.ts in one line and skipped
 * when the module is switched off. Fetches go straight to the box's
 * /api/crypto-desk routes; the readings come composed from there.
 *
 * The scalp family reuses the desk's tools (journal, scorecard, track
 * record, Today, book risk) through asset_class / strategy dimensions; what
 * lives here is only what has no options counterpart: the market-maker read
 * with the evidence packet, the scalp desk, and the three risk tools — the
 * only mutating tools in the family.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceSupabase } from "@/lib/supabase/service";
import { dgxJson, market } from "@/lib/mcp/market";
import { toolByName } from "@/lib/mcp/catalog";
import { CRYPTO_MODULE_ENABLED, isCryptoTicker } from "@/modules/crypto/flag";
import { composeScalpDeskReading, summarizePacket, type ScalpDesk } from "@/lib/readings";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function meta(name: string) {
  const doc = toolByName(name);
  if (!doc) throw new Error(`Missing catalog entry for tool ${name}`);
  return { title: doc.title, description: doc.description };
}

/** BTC-USD → BTCUSDT; BTCUSDT stays. */
export function toPerpSymbol(s: string): string {
  const u = s.toUpperCase();
  return u.endsWith("-USD") ? `${u.slice(0, -4)}USDT` : u;
}

export function registerCryptoTools(reg: McpServer["registerTool"], ctx: { userId: string; supabase: ServiceSupabase }) {
  if (!CRYPTO_MODULE_ENABLED) return;

  reg(
    "get_crypto_reading",
    {
      ...meta("get_crypto_reading"),
      inputSchema: { timeframe: z.enum(["1h", "4h", "1d", "1w"]).optional(), symbol: z.string().min(3).max(20).optional() },
    },
    async (args) => {
      const tf = args.timeframe ?? "4h";
      const symbol = toPerpSymbol(args.symbol ?? "BTCUSDT");
      const [reading, liquidity, packet] = await Promise.all([
        dgxJson<Record<string, unknown>>(`/api/crypto-desk/btc/reading?timeframe=${tf}`),
        dgxJson<Record<string, unknown>>(`/api/crypto-desk/btc/liquidity?timeframe=${tf}`).catch(() => null),
        (market.cryptoEvidence(symbol) as Promise<Record<string, unknown>>).catch(() => null),
      ]);
      return ok({
        ...reading,
        liquidity: liquidity
          ? { pools: liquidity.liquidity_pools, order_blocks: liquidity.order_blocks, fvgs: liquidity.fvgs, premium_discount: liquidity.premium_discount, generated_at: liquidity.generated_at }
          : null,
        // the scalp engine's view of the requested symbol: features, levels, costs, data quality
        evidence: packet ? summarizePacket(packet) : { symbol, available: false, note: "No evidence packet yet: the feature follower has not written one for this symbol." },
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

  reg(
    "get_scalp_desk",
    { ...meta("get_scalp_desk"), inputSchema: { symbol: z.string().min(3).max(20).optional(), limit: z.number().int().min(1).max(200).optional() } },
    async (args) => {
      const desk = (await market.scalpDesk(args.symbol ? toPerpSymbol(args.symbol) : undefined)) as ScalpDesk;
      const limit = args.limit ?? 40;
      return ok({ reading: composeScalpDeskReading(desk), ...desk, rows: (desk.rows ?? []).slice(0, limit) });
    },
  );

  reg(
    "crypto_risk_status",
    { ...meta("crypto_risk_status"), inputSchema: {} },
    async () => ok(await market.cryptoRiskStatus()),
  );

  reg(
    "crypto_halt",
    { ...meta("crypto_halt"), inputSchema: { reason: z.string().min(3).max(300) } },
    async (args) => ok(await market.cryptoRiskHalt(args.reason, `mcp:${ctx.userId.slice(0, 8)}`)),
  );

  reg(
    "crypto_resume",
    { ...meta("crypto_resume"), inputSchema: {} },
    async () => ok(await market.cryptoRiskResume(`mcp:${ctx.userId.slice(0, 8)}`)),
  );
}
