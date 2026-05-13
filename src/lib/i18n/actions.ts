"use server";
import { cookies } from "next/headers";

const LOCALE_COOKIE = "vibefin-locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocaleCookie(locale: "en" | "zh") {
  const c = await cookies();
  c.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: false, // readable client-side for instant UI feedback
  });
}
