"use client";
import { useEffect, useRef } from "react";

const AFF_PARAMS = "?aff_id=165399&source=fin.vibelife.sg";

/**
 * TradingView Ticker Tape widget — scrolling bar of major indices, commodities, crypto.
 */
export function MarketTickerTape() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    // Read current theme from DOM
    const isDark = document.documentElement.classList.contains("dark");

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "FOREXCOM:NSXUSD", title: "Nasdaq" },
        { proName: "FOREXCOM:DJI", title: "Dow 30" },
        { proName: "INDEX:VIX", title: "VIX" },
        { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
        { proName: "BITSTAMP:ETHUSD", title: "Ethereum" },
        { proName: "TVC:GOLD", title: "Gold" },
        { proName: "TVC:USOIL", title: "Crude Oil" },
        { proName: "FX_IDC:EURUSD", title: "EUR/USD" },
        { proName: "TVC:US10Y", title: "US 10Y" },
      ],
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: isDark ? "dark" : "light",
      locale: "en",
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container__widget";
    el.appendChild(wrapper);

    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright";
    copyright.innerHTML = `<a href="https://www.tradingview.com/${AFF_PARAMS}" target="_blank" rel="noopener noreferrer"><span class="blue-text">Track all markets on TradingView</span></a>`;
    el.appendChild(copyright);

    el.appendChild(script);

    return () => { el.innerHTML = ""; };
  }, []);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full overflow-hidden"
      style={{ height: 46 }}
    />
  );
}
