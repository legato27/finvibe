import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
