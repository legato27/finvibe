/**
 * Currency inference + display helpers.
 *
 * The DGX /stocks/search endpoint already returns a `currency` field per
 * match (authoritative), but we also need to infer from a bare ticker when
 * the catalog is stale or when a user types a symbol directly.
 */

export type Currency = "USD" | "HKD" | "CNY" | "SGD" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD";

export const SUPPORTED_CURRENCIES: Currency[] = [
  "USD", "HKD", "CNY", "SGD", "EUR", "GBP", "JPY", "AUD", "CAD",
];

export const CURRENCY_LABELS: Record<Currency, string> = {
  USD: "US Dollar",
  HKD: "Hong Kong Dollar",
  CNY: "Chinese Yuan",
  SGD: "Singapore Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  HKD: "HK$",
  CNY: "¥",
  SGD: "S$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
};

const SUFFIX_CURRENCY: Array<[string, Currency]> = [
  [".HK", "HKD"],
  [".SS", "CNY"],
  [".SZ", "CNY"],
  [".SI", "SGD"],
  [".L",  "GBP"],
  [".T",  "JPY"],
  [".TO", "CAD"],
  [".AX", "AUD"],
  [".PA", "EUR"],
  [".DE", "EUR"],
];

/** Infer currency from a yfinance-style ticker suffix. Defaults to USD. */
export function inferCurrency(ticker: string | undefined | null): Currency {
  if (!ticker) return "USD";
  const t = ticker.toUpperCase();
  for (const [suffix, ccy] of SUFFIX_CURRENCY) {
    if (t.endsWith(suffix)) return ccy;
  }
  return "USD";
}

export type MarketCode = "US" | "HK" | "CN" | "SG" | "ALL";

export const MARKET_OPTIONS: Array<{ code: MarketCode; label: string; flag: string }> = [
  { code: "ALL", label: "All markets", flag: "🌐" },
  { code: "US",  label: "United States", flag: "🇺🇸" },
  { code: "HK",  label: "Hong Kong",     flag: "🇭🇰" },
  { code: "CN",  label: "China (SSE/SZSE)", flag: "🇨🇳" },
  { code: "SG",  label: "Singapore",     flag: "🇸🇬" },
];

export type FxRates = { base: Currency; as_of: string; rates: Partial<Record<Currency, number>> };

/**
 * Convert `amount` from `from` to `to` using the given rate table.
 * `rates` is shaped as { base: "USD", rates: { USD: 1, HKD: 7.8, ... } }.
 * Returns null if the conversion isn't possible with the provided rates.
 */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: FxRates | null | undefined,
): number | null {
  if (from === to) return amount;
  if (!rates) return null;
  const base = rates.base;
  const r = rates.rates;
  const fromRate = from === base ? 1 : r[from];
  const toRate = to === base ? 1 : r[to];
  if (fromRate == null || toRate == null) return null;
  // amount (from) → base → to :  amount / fromRate * toRate
  return (amount / fromRate) * toRate;
}

/** Format a number with the given currency. Always shows currency code for clarity. */
export function formatCurrency(
  amount: number | null | undefined,
  currency: Currency,
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const { compact = false, decimals = 2 } = opts;
  const absValue = Math.abs(amount);
  if (compact && absValue >= 1_000_000) {
    return `${CURRENCY_SYMBOLS[currency]}${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (compact && absValue >= 1_000) {
    return `${CURRENCY_SYMBOLS[currency]}${(amount / 1_000).toFixed(1)}k`;
  }
  return `${CURRENCY_SYMBOLS[currency]}${amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
