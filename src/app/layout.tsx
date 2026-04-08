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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
