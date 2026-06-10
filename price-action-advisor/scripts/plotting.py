"""
plotting.py — annotated candlestick charts for the PAM analysis.

Renders weekly and monthly frames with: candles, swing highs/lows,
sweet-spot zone band, stop line, range high/low, FSB markers, and an
RSI subpanel. Saves a single combined PNG.

Pure matplotlib (no mplfinance dependency) for portability.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

from pam_engine import rsi, classify_structure, last_impulse, fib_zone, detect_fsb


def _candles(ax, df, width=0.6):
    up = df["Close"] >= df["Open"]
    x = np.arange(len(df))
    # wicks
    ax.vlines(x, df["Low"], df["High"], color="#888", linewidth=0.7, zorder=1)
    # bodies
    for color, mask in [("#26a69a", up), ("#ef5350", ~up)]:
        idx = x[mask.values]
        o = df["Open"].values[mask.values]
        c = df["Close"].values[mask.values]
        bottoms = np.minimum(o, c)
        heights = np.abs(c - o).astype(float)
        rngs = (df["High"].values[mask.values] - df["Low"].values[mask.values])
        flat = heights == 0
        heights[flat] = rngs[flat] * 0.02 + 1e-9
        ax.bar(idx, heights, width, bottom=bottoms, color=color, edgecolor=color, zorder=2)
    return x


def _annotate_frame(ax, axr, df, title):
    df = df.dropna(subset=["Open", "High", "Low", "Close"]).reset_index(drop=True)
    x = _candles(ax, df)
    si = classify_structure(df)
    imp = last_impulse(df, si)
    fib = fib_zone(imp)
    fsb = detect_fsb(df)

    for i in si["swing_highs_idx"]:
        ax.scatter(i, df["High"].iloc[i], marker="v", color="#c62828", s=28, zorder=4)
    for i in si["swing_lows_idx"]:
        ax.scatter(i, df["Low"].iloc[i], marker="^", color="#2e7d32", s=28, zorder=4)

    if fib:
        ax.axhspan(fib["zone_low"], fib["zone_high"], color="#42a5f5", alpha=0.15, zorder=0)
        ax.axhline(fib["f50"], color="#1e88e5", ls="--", lw=0.8, alpha=0.6)
        ax.axhline(fib["f618"], color="#1e88e5", ls="--", lw=0.8, alpha=0.6)
        ax.text(0, fib["zone_high"], " sweet spot 50–61.8%", color="#1565c0",
                fontsize=7, va="bottom")

    ax.axhline(si["range_high"], color="#9e9e9e", ls=":", lw=0.8)
    ax.axhline(si["range_low"], color="#9e9e9e", ls=":", lw=0.8)

    for f in fsb["all"]:
        i = f["idx"]
        m = "*"
        col = "#00897b" if f["dir"] == "bull" else "#d81b60"
        y = df["Low"].iloc[i] if f["dir"] == "bull" else df["High"].iloc[i]
        off = -(df["High"].iloc[i] - df["Low"].iloc[i]) * 0.4 if f["dir"] == "bull" else (df["High"].iloc[i] - df["Low"].iloc[i]) * 0.4
        ax.scatter(i, y + off, marker=m, color=col, s=70, zorder=5)

    ax.set_title(f"{title}  |  structure: {si['structure']} ({si['clarity']})",
                 fontsize=10, loc="left")
    ax.set_ylabel("Price")
    ax.grid(alpha=0.15)

    # date ticks
    step = max(1, len(df) // 8)
    dt = pd.to_datetime(df["Date"]) if "Date" in df else pd.to_datetime(df.iloc[:, 0])
    ax.set_xticks(x[::step])
    ax.set_xticklabels([d.strftime("%b'%y") for d in dt[::step]], fontsize=7)

    r = rsi(df["Close"])
    axr.plot(x, r, color="#5e35b1", lw=1)
    axr.axhline(70, color="#bbb", ls="--", lw=0.6)
    axr.axhline(30, color="#bbb", ls="--", lw=0.6)
    axr.set_ylim(0, 100)
    axr.set_ylabel("RSI", fontsize=8)
    axr.set_xticks(x[::step])
    axr.set_xticklabels([d.strftime("%b'%y") for d in dt[::step]], fontsize=7)
    axr.grid(alpha=0.15)


def plot_analysis(weekly: pd.DataFrame, monthly: pd.DataFrame, ticker: str, out_path: str):
    fig = plt.figure(figsize=(14, 11))
    gs = fig.add_gridspec(4, 2, height_ratios=[3, 1, 3, 1], hspace=0.35, wspace=0.18)

    axw = fig.add_subplot(gs[0, :])
    axwr = fig.add_subplot(gs[1, :], sharex=axw)
    _annotate_frame(axw, axwr, weekly.reset_index(), f"{ticker} — WEEKLY (3Y)")

    axm = fig.add_subplot(gs[2, :])
    axmr = fig.add_subplot(gs[3, :], sharex=axm)
    _annotate_frame(axm, axmr, monthly.reset_index(), f"{ticker} — MONTHLY")

    fig.suptitle(f"PAM Analysis — {ticker}", fontsize=14, fontweight="bold", y=0.995)
    legend = ("▲/▼ swings   ★ Force Strike Bar   blue band = sweet spot (50–61.8% Fib)   "
              "dotted = 3Y range hi/lo")
    fig.text(0.5, 0.005, legend, ha="center", fontsize=8, color="#555")
    fig.savefig(out_path, dpi=130, bbox_inches="tight")
    plt.close(fig)
    return out_path
