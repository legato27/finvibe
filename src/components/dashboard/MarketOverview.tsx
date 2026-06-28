"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/shared/ThemeProvider";

const AFF_PARAMS = "?aff_id=165399&source=fin.vibelife.sg";

/**
 * TradingView Market Overview widget — shows major indices with mini-charts.
 */
export function MarketOverview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("dashboard");
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    // Follow the app theme so the (transparent) widget isn't a dark island on a
    // light card. "auto" resolves from the <html> class set by the theme script.
    const isDark =
      theme === "dark" ||
      (theme === "auto" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: isDark ? "dark" : "light",
      dateRange: "1D",
      showChart: true,
      locale: "en",
      largeChartUrl: `https://www.tradingview.com/chart/${AFF_PARAMS}&`,
      isTransparent: true,
      showSymbolLogo: true,
      showFloatingTooltip: true,
      width: "100%",
      height: "100%",
      tabs: [
        {
          title: t("tabIndices"),
          symbols: [
            { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
            { s: "FOREXCOM:NSXUSD", d: "Nasdaq" },
            { s: "FOREXCOM:DJI", d: "Dow 30" },
            { s: "INDEX:VIX", d: "VIX" },
            { s: "AMEX:IWM", d: "Russell 2000" },
          ],
        },
        {
          title: t("tabSectors"),
          symbols: [
            { s: "AMEX:XLK", d: t("sectorTechnology") },
            { s: "AMEX:XLF", d: t("sectorFinancials") },
            { s: "AMEX:XLE", d: t("sectorEnergy") },
            { s: "AMEX:XLV", d: t("sectorHealthCare") },
            { s: "AMEX:XLY", d: t("sectorConsumerDisc") },
            { s: "AMEX:XLI", d: t("sectorIndustrials") },
          ],
        },
        {
          title: t("tabCrypto"),
          symbols: [
            { s: "BITSTAMP:BTCUSD", d: "Bitcoin" },
            { s: "BITSTAMP:ETHUSD", d: "Ethereum" },
            { s: "BINANCE:SOLUSD", d: "Solana" },
            { s: "BINANCE:XRPUSD", d: "XRP" },
          ],
        },
        {
          title: t("tabCommodities"),
          symbols: [
            { s: "TVC:GOLD", d: t("commodityGold") },
            { s: "TVC:SILVER", d: t("commoditySilver") },
            { s: "TVC:USOIL", d: t("commodityCrudeOil") },
            { s: "TVC:UKOIL", d: t("commodityBrentOil") },
          ],
        },
      ],
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container__widget";
    wrapper.style.height = "calc(100% - 32px)";
    wrapper.style.width = "100%";
    containerRef.current.appendChild(wrapper);

    // Copyright attribution with affiliate link
    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright";
    copyright.innerHTML = `<a href="https://www.tradingview.com/markets/${AFF_PARAMS}" target="_blank" rel="noopener noreferrer"><span class="blue-text">Track all markets on TradingView</span></a>`;
    containerRef.current.appendChild(copyright);

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [t, theme]);

  return (
    <div className="card overflow-hidden h-full">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: "100%", minHeight: 340, width: "100%" }}
      />
    </div>
  );
}
