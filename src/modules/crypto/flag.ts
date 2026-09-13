/**
 * Crypto module switch and the one test the shared surfaces call.
 *
 * `NEXT_PUBLIC_CRYPTO_MODULE=0` sunsets the module without a code change:
 * the Desk choice, the route, the MCP tools and the watchlist and stock-page
 * hooks all render nothing. Removing the module means deleting
 * src/modules/crypto, src/app/desk/crypto, the allowlist block, the copy
 * namespace, the catalog entries, and the one-line hooks that import this.
 */
export const CRYPTO_MODULE_ENABLED = process.env.NEXT_PUBLIC_CRYPTO_MODULE !== "0";

const BASES = new Set(["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "AVAX", "LINK", "DOT", "MATIC", "LTC"]);

/** yfinance-style crypto symbols end in -USD; bare majors count too. */
export function isCryptoTicker(ticker: string | null | undefined): boolean {
  const t = (ticker ?? "").toUpperCase();
  return t.endsWith("-USD") || BASES.has(t);
}
