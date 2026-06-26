// next-intl request config — single-locale (English only).
import { getRequestConfig } from "next-intl/server";

export const DEFAULT_LOCALE = "en" as const;

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  const messages = (await import("../../messages/en.json")).default;
  return { locale, messages };
});
