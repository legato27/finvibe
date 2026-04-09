"use client";
import { useEffect, useRef } from "react";

const AFF_PARAMS = "?aff_id=165399&source=fin.vibelife.sg";

/**
 * TradingView Market Overview widget — shows major indices with mini-charts.
 */
export function MarketOverview() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const isDark = document.documentElement.classList.contains("dark");

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
          title: "Indices",
          symbols: [
            { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
            { s: "FOREXCOM:NSXUSD", d: "Nasdaq" },
            { s: "FOREXCOM:DJI", d: "Dow 30" },
            { s: "INDEX:VIX", d: "VIX" },
            { s: "AMEX:IWM", d: "Russell 2000" },
          ],
        },
        {
          title: "Sectors",
          symbols: [
            { s: "AMEX:XLK", d: "Technology" },
            { s: "AMEX:XLF", d: "Financials" },
            { s: "AMEX:XLE", d: "Energy" },
            { s: "AMEX:XLV", d: "Health Care" },
            { s: "AMEX:XLY", d: "Consumer Disc." },
            { s: "AMEX:XLI", d: "Industrials" },
          ],
        },
        {
          title: "Crypto",
          symbols: [
            { s: "BITSTAMP:BTCUSD", d: "Bitcoin" },
            { s: "BITSTAMP:ETHUSD", d: "Ethereum" },
            { s: "BINANCE:SOLUSD", d: "Solana" },
            { s: "BINANCE:XRPUSD", d: "XRP" },
          ],
        },
        {
          title: "Commodities",
          symbols: [
            { s: "TVC:GOLD", d: "Gold" },
            { s: "TVC:SILVER", d: "Silver" },
            { s: "TVC:USOIL", d: "Crude Oil" },
            { s: "TVC:UKOIL", d: "Brent Oil" },
          ],
        },
      ],
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container__widget";
    wrapper.style.height = "calc(100% - 32px)";
    wrapper.style.width = "100%";
    el.appendChild(wrapper);

    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright";
    copyright.innerHTML = `<a href="https://www.tradingview.com/markets/${AFF_PARAMS}" target="_blank" rel="noopener noreferrer"><span class="blue-text">Track all markets on TradingView</span></a>`;
    el.appendChild(copyright);

    el.appendChild(script);

    return () => { el.innerHTML = ""; };
  }, []);

  return (
    <div className="card overflow-hidden h-full">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: "100%", minHeight: 420, width: "100%" }}
      />
    </div>
  );
}
