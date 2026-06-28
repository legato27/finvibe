import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

// "Market Terminal" type system — IBM Plex Sans for body, IBM Plex Mono for
// numerics, tickers and labels.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VibeFin | Your Daily Market Vibe Check",
  description: "Real-time market intelligence dashboard — macro regime, VIX, GEX, sector rotation, breadth, crypto, and news sentiment in one view.",
  icons: {
    icon: "/vibefin-icon.svg",
    apple: "/vibefin-icon.svg",
  },
  openGraph: {
    title: "VibeFin",
    description: "Your daily market vibe check",
    type: "website",
  },
};

// Inline script to prevent FOUC — runs before React hydrates
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('vibefin-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
