#!/usr/bin/env python3
"""
analyze.py — PAM analysis CLI.

Fetches historical OHLCV data via yfinance, runs the PAM
engine, renders an annotated chart, and prints the structured report.
Updated to use Weekly and Daily timeframes (removing Monthly).
"""

from __future__ import annotations
import argparse, json, os, sys
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pam_engine import analyze_frame, Analysis
from plotting import plot_analysis

def fetch_data(ticker: str, timeframe: str = "1wk"):
    """
    Fetches historical OHLCV data.
    Priority: 
    1. FinVibe (via internal tool call simulation/logic)
    2. yfinance (fallback)
    """
    import yfinance as yf
    import pandas as pd
    
    try:
        # Placeholder for direct FinVibe API if available
        print(f"[info] Attempting FinVibe data fetch for {ticker}...")
        raise NotImplementedError("Direct FinVibe API call not configured in standalone script.")
    except Exception as e:
        print(f"[info] FinVibe fetch skipped/failed ({e}). Falling back to yfinance.")
        
        # We now fetch Daily and Weekly as requested. 
        # Monthly is removed to focus on actionable timeframes.
        interval_map = {"1wk": "1wk", "1d": "1d", "1h": "1h"}
        iv = interval_map.get(timeframe, "1wk")
        
        # Fetch Weekly (Primary for structure)
        wk = yf.download(ticker, period="3y", interval="1wk", progress=False, auto_adjust=False)
        
        # Fetch Daily (Primary for execution/FSB)
        day = yf.download(ticker, period="6mo", interval="1d", progress=False, auto_adjust=False)
        
        if wk is None or wk.empty or day is None or day.empty:
            raise RuntimeError(f"No data returned for {ticker} via yfinance.")
            
        # Handle yfinance MultiIndex columns
        for d in (wk, day):
            if isinstance(d.columns, pd.MultiIndex):
                d.columns = d.columns.get_level_values(0)
        
        return wk, day

def load_csv(path: str):
    df = pd.read_csv(path, parse_dates=["Date"]).set_index("Date").sort_index()
    need = {"Open", "High", "Low", "Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"CSV must contain {need}; got {set(df.columns)}")
    if "Volume" not in df:
        df["Volume"] = 0
    # Defaulting to weekly/daily split for CSV fallback
    wk = df.iloc[-156:] if len(df) > 156 else df
    day = df.iloc[-126:] if len(df) > 126 else df
    return wk, day

def fmt(a: Analysis) -> str:
    ss = a.sweet_spot
    sz = a.sizing
    L = []
    P = L.append
    
    # Determine Regime Label
    regime = "UNKNOWN"
    if a.setup and "UP" in a.setup.upper():
        regime = "UC" 
    elif a.setup and "DOWN" in a.setup.upper():
        regime = "DC"
    elif a.setup and "REVERSAL" in a.setup.upper():
        regime = "REV"

    # Determine Signal Status
    status_msg = "WATCHING (Awaiting FSB)"
    if a.fsb.get("recent"):
        status_msg = "TRIGGERED (FSB Confirmed)"

    P("═══════════════════════════════════════════════")
    P(f"  PRICE ACTION ANALYSIS — {a.ticker}")
    P(f"  REGIME: [{regime}] | STATUS: [{status_msg}]")
    P("═══════════════════════════════════════════════")
    P(f"\nLast close: {a.last_close}\n")
    P("📊 STRUCTURE")
    P(f"  Type:            {a.structure['type']}")
    P(f"  Clarity:         {a.structure['clarity']}")
    P(f"  3Y Range:        {a.structure['range_low']} — {a.structure['range_high']}")
    P("\n🎯 SETUP IDENTIFICATION")
    P(f"  Setup Code:      {a.setup}")
    P("\n📍 KEY LEVELS")
    if ss:
        P(f"  Sweet Spot Zone: {ss['low']} — {ss['high']}")
    else:
        P("  Sweet Spot Zone: n/a")
    P(f"  Stop Suggestion: {a.stop_suggestion}")
    if sz:
        P(f"  Direction:       {sz['direction']}")
        P(f"  Target (2R):     {sz['target_1R2R']}")
        P(f"  Target (3R):     {sz['target_extended']}")
        P(f"  Stop Distance:   {sz['stop_distance']} ({sz['stop_distance_pct']}%)\n")
    P("\n⚡ EXECUTION SIGNAL")
    rec = a.fsb["recent"]
    if rec:
        P(f"  FSB:             {rec['dir'].upper()} bar, {rec['range_mult']:.1f}x avg range")
    else:
        P("  FSB:             None in last 4 bars")
    P(f"  FSBs in 3Y:      {a.fsb['count_3y']}")
    P("\n🔍 DIVERGENCE")
    P(f"  Status:          {a.divergence['status']} (RSI {a.divergence['rsi_now']:.0f})")
    P("\n🏦 ACCUMULATION / DISTRIBUTION")
    P(f"  Present:         {a.accum_dist['present']}")
    P(f"  Notes:           {a.accum_dist['notes']}")
    P("\n📈 PROBABILITY ASSESSMENT")
    P(f"  Probability:     {a.probability}%")
    P(f"  Confidence:      {a.confidence}")
    P("\n💰 RISK MANAGEMENT (2% rule)")
    if sz:
        P(f"  Dollar Risk:     ${sz['dollar_risk']}")
        P(f"  Position Size:   {sz['shares']} units")
    else:
        P("  No active sizing.")
    P("\n⚠️  INVALIDATION")
    P(f"  {a.invalidation}")
    if a.notes:
        P("\n📝 NOTES")
        for n in a.notes:
            P(f"  • {n}")
    P("\n— Probability ≠ certainty. No signal = no trade.")
    return "\n".join(L)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ticker")
    ap.add_argument("--account", type=float, default=20000.0)
    ap.add_argument("--risk", type=float, default=0.02)
    ap.add_argument("--csv", default=None, help="offline OHLCV CSV fallback")
    ap.add_argument("--payload", default=None, help="hybrid JSON payload (math_data + intelligence)")
    ap.add_argument("--out", default=None, help="chart output path")
    ap.add_argument("--json", action="store_true", help="also print JSON")
    args = ap.parse_args()

    try:
        if args.payload:
            print(f"[info] Loading hybrid payload from {args.payload}...")
            with open(args.payload, 'r') as f:
                payload = json.load(f)
            
            wk_df = pd.DataFrame(payload['math_data'])
            if 'Date' in wk_df.columns:
                wk_df['Date'] = pd.to_datetime(wk_df['Date'])
                wk_df.set_index('Date', inplace=True)
            
            # Split payload data into Weekly and Daily approximations
            wk = wk_df
            day = wk_df.resample("D").first().ffill() # Approximation for payload
            
            intel_context = payload.get('intelligence', {})
        elif args.csv:
            wk, day = load_csv(args.csv)
            intel_context = {}
        else:
            wk, day = fetch_data(args.ticker, timeframe="1wk")
            intel_context = {}
    except Exception as e:
        print(f"[data error] {e}", file=sys.stderr)
        sys.exit(2)

    # Pass both dataframes to the engine
    a = analyze_frame(wk, args.ticker, "weekly", account=args.account, risk_pct=args.risk, daily_df=day)

    if intel_context:
        if not hasattr(a, 'notes') or a.notes is None:
            a.notes = []
        a.notes.append("--- FINVIBE INTELLIGENCE ---")
        for key, val in intel_context.items():
            if isinstance(val, (str, int, float)):
                a.notes.append(f"{key.replace('_', ' ').title()}: {val}")
            elif isinstance(val, list):
                a.notes.append(f"{key.replace('_', ' ').title()}:")
                for item in val:
                    a.notes.append(f"  • {item}")
        a.notes.append("-----------------------------")

    out = args.out or f"{args.ticker.replace('-', '_').replace('.', '_')}_PAM.png"
    try:
        # Plotting now receives both dataframes
        plot_analysis(wk, day, args.ticker, out)
        print(f"[chart] saved {out}")
    except Exception as e:
        print(f"[chart warning] {e}", file=sys.stderr)

    print(fmt(a))
    if args.json:
        from dataclasses import asdict
        print("\n--- JSON ---")
        print(json.dumps(asdict(a), default=str, indent=2))

if __name__ == "__main__":
    main()
