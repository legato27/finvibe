// next-intl request config — cookie-based locale (no URL prefix).
// Locale resolution order:
//   1. cookie "vibefin-locale"
//   2. Accept-Language header (zh* -> zh, else en)
//   3. fallback "en"
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("vibefin-locale")?.value;
  if (fromCookie && (SUPPORTED_LOCALES as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale;
  }
  const hdrs = await headers();
  const al = hdrs.get("accept-language") || "";
  if (/^zh\b/i.test(al)) return "zh";
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
