"use client";
import { useEffect, useRef } from "react";

/**
 * TradingView Ticker Tape widget — scrolling bar of major indices, commodities, crypto.
 */
export function MarketTickerTape() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

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
      colorTheme: "dark",
      locale: "en",
      utm_source: "finvibe",
      utm_medium: "widget",
      utm_campaign: "ticker-tape",
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container__widget";
    containerRef.current.appendChild(wrapper);
    containerRef.current.appendChild(script);

    // Inject affiliate ID into TradingView copyright links
    const observer = new MutationObserver(() => {
      containerRef.current?.querySelectorAll<HTMLAnchorElement>('a[href*="tradingview.com"]').forEach((a) => {
        if (!a.href.includes("aff_id")) {
          const url = new URL(a.href);
          url.searchParams.set("aff_id", "165399");
          a.href = url.toString();
        }
      });
    });
    if (containerRef.current) observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full overflow-hidden"
      style={{ height: 46 }}
    />
  );
}
