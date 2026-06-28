import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

// "VibeFin App" type system — Inter for body/UI, Space Grotesk for display
// (headings, stat figures, labels). Space Grotesk is wired to --font-mono so
// existing `font-mono` numerics/labels render in the design's figure font.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
