"""
PAM Engine — Price Action Manipulation analytical core.

Pure computation over OHLCV DataFrames. No I/O, no plotting.
Encodes the framework from SKILL.md: structure (UC/DC/UR/DR), setup variants,
swing/Fib sweet-spot zones, Force Strike Bar detection, divergence (RSI),
accumulation/distribution hints, probability scoring, and 2% risk sizing
(per the XSPY Risk/Money framework: size = dollar_risk / stop_distance).

All thresholds are heuristics meant to SUPPORT a discretionary trader, not
to fire orders. Everything returned is evidence for the human to judge.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
import numpy as np
import pandas as pd


# ----------------------------- indicators ---------------------------------

def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss
    out = 100 - 100 / (1 + rs)
    # zero-loss (pure up) -> 100; zero-gain (pure down) -> 0; both zero -> 50
    out = out.where(loss != 0, 100.0)
    out = out.where(~((loss == 0) & (gain == 0)), 50.0)
    out = out.where(gain != 0, out)  # keep
    out.iloc[0] = 50.0
    return out.ffill().fillna(50)


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    h, l, c = df["High"], df["Low"], df["Close"]
    pc = c.shift(1)
    tr = pd.concat([(h - l), (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


# ------------------------------- swings ------------------------------------

def find_swings(df: pd.DataFrame, left: int = 2, right: int = 2):
    """Fractal swing highs/lows. Returns (highs_idx, lows_idx) as positional lists."""
    highs, lows = [], []
    H, L = df["High"].values, df["Low"].values
    n = len(df)
    for i in range(left, n - right):
        win_h = H[i - left:i + right + 1]
        win_l = L[i - left:i + right + 1]
        if H[i] == win_h.max() and (win_h.argmax() == left):
            highs.append(i)
        if L[i] == win_l.min() and (win_l.argmin() == left):
            lows.append(i)
    return highs, lows


def classify_structure(df: pd.DataFrame, left=2, right=2) -> dict:
    """Classify trend structure from the last swings: UC / DC / UR zone / DR zone / Ranging."""
    highs, lows = find_swings(df, left, right)
    H, L = df["High"].values, df["Low"].values
    close = float(df["Close"].iloc[-1])

    last_highs = [H[i] for i in highs[-3:]]
    last_lows = [L[i] for i in lows[-3:]]

    def rising(seq):
        return len(seq) >= 2 and all(b > a for a, b in zip(seq, seq[1:]))

    def falling(seq):
        return len(seq) >= 2 and all(b < a for a, b in zip(seq, seq[1:]))

    hh = rising(last_highs)
    hl = rising(last_lows)
    lh = falling(last_highs)
    ll = falling(last_lows)

    lookback = min(len(df), 156)  # ~3y weekly
    hi_extreme = float(df["High"].iloc[-lookback:].max())
    lo_extreme = float(df["Low"].iloc[-lookback:].min())
    near_low = close <= lo_extreme * 1.08
    near_high = close >= hi_extreme * 0.92

    # EMA-slope fallback when fractal swings are too sparse to judge
    ema_fast = df["Close"].ewm(span=10, adjust=False).mean()
    ema_slow = df["Close"].ewm(span=30, adjust=False).mean()
    slope_up = ema_fast.iloc[-1] > ema_slow.iloc[-1] and ema_slow.iloc[-1] > ema_slow.iloc[-min(len(df), 8)]
    slope_dn = ema_fast.iloc[-1] < ema_slow.iloc[-1] and ema_slow.iloc[-1] < ema_slow.iloc[-min(len(df), 8)]
    sparse = (len(last_highs) < 2) or (len(last_lows) < 2)

    if hh and hl:
        struct = "UC"
    elif lh and ll:
        struct = "DC"
    elif near_low and (ll or falling(last_highs)):
        struct = "UR zone"
    elif near_high and (hh or rising(last_lows)):
        struct = "DR zone"
    elif near_low:
        struct = "UR zone"
    elif near_high:
        struct = "DR zone"
    elif sparse and slope_up:
        struct = "UC"
    elif sparse and slope_dn:
        struct = "DC"
    else:
        struct = "Ranging"

    clarity = "High" if (hh and hl) or (lh and ll) else (
        "Moderate" if (hh or hl or lh or ll or (sparse and (slope_up or slope_dn))) else "Low")
    return {
        "structure": struct,
        "clarity": clarity,
        "swing_highs_idx": highs,
        "swing_lows_idx": lows,
        "range_high": hi_extreme,
        "range_low": lo_extreme,
        "last_highs": last_highs,
        "last_lows": last_lows,
    }


# ----------------------------- Fib / sweet spot -----------------------------

def last_impulse(df: pd.DataFrame, struct_info: dict):
    """Identify the most recent impulse leg to anchor Fib retracements."""
    highs = struct_info["swing_highs_idx"]
    lows = struct_info["swing_lows_idx"]
    if not highs or not lows:
        return None
    last_h, last_l = highs[-1], lows[-1]
    H, L = df["High"].values, df["Low"].values
    if last_h > last_l:  # up leg most recent
        return {"dir": "up", "start_idx": last_l, "end_idx": last_h,
                "start": float(L[last_l]), "end": float(H[last_h])}
    else:
        return {"dir": "down", "start_idx": last_h, "end_idx": last_l,
                "start": float(H[last_h]), "end": float(L[last_l])}


def fib_zone(impulse: dict):
    """50–61.8% retracement of the last impulse = primary sweet-spot band."""
    if not impulse:
        return None
    a, b = impulse["start"], impulse["end"]
    rng = b - a
    f50 = b - 0.50 * rng
    f618 = b - 0.618 * rng
    lo, hi = sorted([f50, f618])
    return {"f50": f50, "f618": f618, "zone_low": lo, "zone_high": hi}


# ------------------------------- FSB ---------------------------------------

def detect_fsb(df: pd.DataFrame, vol_lookback=20, body_mult=1.5):
    """
    Force Strike Bar: range markedly larger than recent average, close near
    extreme (small opposing wick), above-average volume. Returns latest FSB
    within last 4 bars if present.
    """
    out = []
    rng = (df["High"] - df["Low"])
    avg_rng = rng.rolling(vol_lookback).mean()
    body = (df["Close"] - df["Open"]).abs()
    has_vol = "Volume" in df and df["Volume"].notna().any() and df["Volume"].sum() > 0
    avg_vol = df["Volume"].rolling(vol_lookback).mean() if has_vol else None

    for i in range(len(df)):
        if pd.isna(avg_rng.iloc[i]) or avg_rng.iloc[i] == 0:
            continue
        big = rng.iloc[i] >= body_mult * avg_rng.iloc[i]
        if not big:
            continue
        o, c, h, l = (df[k].iloc[i] for k in ["Open", "Close", "High", "Low"])
        bull = c > o
        close_pos = (c - l) / (h - l) if h > l else 0.5
        near_ext = close_pos >= 0.7 if bull else close_pos <= 0.3
        vol_ok = True if not has_vol else (df["Volume"].iloc[i] >= avg_vol.iloc[i])
        if near_ext and vol_ok:
            out.append({"idx": i, "dir": "bull" if bull else "bear",
                        "vol_confirmed": bool(has_vol and vol_ok),
                        "range_mult": float(rng.iloc[i] / avg_rng.iloc[i])})
    recent = [f for f in out if f["idx"] >= len(df) - 4]
    return {"all": out, "recent": recent[-1] if recent else None, "has_volume": has_vol}


# ----------------------------- divergence ----------------------------------

def detect_divergence(df: pd.DataFrame, struct_info: dict):
    r = rsi(df["Close"])
    highs = struct_info["swing_highs_idx"][-2:]
    lows = struct_info["swing_lows_idx"][-2:]
    H, L = df["High"].values, df["Low"].values
    res = {"status": "None", "implication": "Momentum confirms price."}
    if len(highs) == 2:
        p1, p2 = H[highs[0]], H[highs[1]]
        m1, m2 = r.iloc[highs[0]], r.iloc[highs[1]]
        if p2 > p1 and m2 < m1:
            res = {"status": "Regular Bearish", "implication": "Uptrend weakening — caution on UC; watch for DR."}
        elif p2 < p1 and m2 > m1:
            res = {"status": "Hidden Bearish", "implication": "DC continuation confirmed — strengthens short."}
    if len(lows) == 2 and res["status"] == "None":
        p1, p2 = L[lows[0]], L[lows[1]]
        m1, m2 = r.iloc[lows[0]], r.iloc[lows[1]]
        if p2 < p1 and m2 > m1:
            res = {"status": "Regular Bullish", "implication": "Downtrend weakening — caution on DC; watch for UR."}
        elif p2 > p1 and m2 < m1:
            res = {"status": "Hidden Bullish", "implication": "UC continuation confirmed — strengthens long."}
    res["rsi_now"] = float(r.iloc[-1])
    return res


# -------------------------- accumulation/distribution -----------------------

def accum_dist(df: pd.DataFrame, struct_info: dict):
    has_vol = "Volume" in df and df["Volume"].sum() > 0
    if not has_vol:
        return {"present": "Unknown", "notes": "No volume data — A/D inconclusive."}
    recent = df.iloc[-12:]
    rng_now = recent["High"].max() - recent["Low"].min()
    rng_prior = df["High"].iloc[-24:-12].max() - df["Low"].iloc[-24:-12].min() if len(df) >= 24 else rng_now
    contracting = rng_now < rng_prior * 0.9
    down_vol = recent.loc[recent["Close"] < recent["Open"], "Volume"].mean()
    up_vol = recent.loc[recent["Close"] >= recent["Open"], "Volume"].mean()
    struct = struct_info["structure"]
    if struct.startswith("UR") and contracting and (down_vol or 0) >= (up_vol or 0):
        return {"present": "Possible", "notes": "Range contraction + selling climaxes — accumulation watch."}
    if struct.startswith("DR") and contracting and (up_vol or 0) >= (down_vol or 0):
        return {"present": "Possible", "notes": "Range contraction + buying climaxes — distribution watch."}
    return {"present": "No", "notes": "No clear A/D range in last 12 bars."}


# ------------------------------ probability ---------------------------------

def setup_variant(struct_info, impulse, fsb, divergence):
    s = struct_info["structure"]
    rec = fsb["recent"]
    if s == "UC":
        return "UC1" if rec and rec["dir"] == "bull" else "UC1 (watch)"
    if s == "DC":
        return "DC1" if rec and rec["dir"] == "bear" else "DC1 (watch)"
    if s.startswith("UR"):
        return "UR1" if rec and rec["dir"] == "bull" else "UR1 (watch)"
    if s.startswith("DR"):
        return "DR1" if rec and rec["dir"] == "bear" else "DR1 (watch)"
    return "None"


def probability(struct_info, fsb, divergence, setup):
    score = 0
    clarity_map = {"High": 40, "Moderate": 24, "Low": 8}
    score += clarity_map.get(struct_info["clarity"], 8)
    rec = fsb["recent"]
    if rec:
        score += 25 if rec["vol_confirmed"] else 16
    aligned_long = setup.startswith(("UC", "UR")) and divergence["status"] in ("Hidden Bullish", "Regular Bullish")
    aligned_short = setup.startswith(("DC", "DR")) and divergence["status"] in ("Hidden Bearish", "Regular Bearish")
    if aligned_long or aligned_short:
        score += 15
    elif divergence["status"] == "None":
        score += 8
    if fsb["has_volume"]:
        score += 10
    score += 10  # broader-context baseline; trader adjusts
    score = max(5, min(95, score))
    conf = "High" if score >= 70 else ("Moderate" if score >= 50 else "Low")
    return score, conf


# ------------------------------ sizing --------------------------------------

def position_sizing(entry, stop, account, risk_pct=0.02, rr_min=2.0):
    """XSPY framework: dollar_risk = account*risk_pct; size = dollar_risk / |entry-stop|."""
    dollar_risk = account * risk_pct
    stop_dist = abs(entry - stop)
    if stop_dist <= 0:
        return None
    size = dollar_risk / stop_dist
    is_long = stop < entry
    t1 = entry + rr_min * stop_dist if is_long else entry - rr_min * stop_dist
    t2 = entry + (rr_min + 1) * stop_dist if is_long else entry - (rr_min + 1) * stop_dist
    return {
        "direction": "LONG" if is_long else "SHORT",
        "dollar_risk": round(dollar_risk, 2),
        "stop_distance": round(stop_dist, 4),
        "stop_distance_pct": round(stop_dist / entry * 100, 2),
        "shares": round(size, 4),
        "target_1R2R": round(t1, 4),
        "target_extended": round(t2, 4),
        "rr_used": rr_min,
    }


# ------------------------------ orchestrate ---------------------------------

@dataclass
class Analysis:
    ticker: str
    timeframe: str
    last_close: float
    structure: dict
    setup: str
    sweet_spot: dict | None
    stop_suggestion: float | None
    fsb: dict
    divergence: dict
    accum_dist: dict
    probability: int
    confidence: str
    sizing: dict | None
    invalidation: str
    notes: list = field(default_factory=list)


def analyze_frame(df: pd.DataFrame, ticker: str, timeframe: str,
                  account=20000.0, risk_pct=0.02, daily_df=None) -> Analysis:
    df = df.dropna(subset=["Open", "High", "Low", "Close"]).copy().reset_index(drop=False)
    si = classify_structure(df)
    imp = last_impulse(df, si)
    fib = fib_zone(imp)
    fsb = detect_fsb(df)
    div = detect_divergence(df, si)
    ad = accum_dist(df, si)
    setup = setup_variant(si, imp, fsb, div)
    prob, conf = probability(si, fsb, div, setup)
    close = float(df["Close"].iloc[-1])

    a = atr(df).iloc[-1]
    sweet = None
    stop = None
    sizing = None
    invalid = "Pending — define on confirmed signal."

    if setup.startswith(("UC", "UR")) and fib:
        sweet = {"low": round(fib["zone_low"], 4), "high": round(fib["zone_high"], 4)}
        entry = (fib["zone_low"] + fib["zone_high"]) / 2
        stop = round(min(si["range_low"], fib["zone_low"] - 1.0 * a), 4)
        sizing = position_sizing(entry, stop, account, risk_pct, rr_min=2.0)
        invalid = f"Weekly close below {stop} invalidates the long."
    elif setup.startswith(("DC", "DR")) and fib:
        sweet = {"low": round(fib["zone_low"], 4), "high": round(fib["zone_high"], 4)}
        entry = (fib["zone_low"] + fib["zone_high"]) / 2
        stop = round(max(si["range_high"], fib["zone_high"] + 1.0 * a), 4)
        sizing = position_sizing(entry, stop, account, risk_pct, rr_min=2.0)
        invalid = f"Weekly close above {stop} invalidates the short."

    notes = []
    if not fsb["has_volume"]:
        notes.append("No reliable volume — FSB/A-D weighted down; treat volume-dependent calls cautiously.")
    if "watch" in setup:
        notes.append("No execution signal at the sweet spot yet — watchlist/alert mode, not an entry.")

    return Analysis(
        ticker=ticker, timeframe=timeframe, last_close=round(close, 4),
        structure={"type": si["structure"], "clarity": si["clarity"],
                   "range_high": round(si["range_high"], 4), "range_low": round(si["range_low"], 4)},
        setup=setup, sweet_spot=sweet, stop_suggestion=stop, fsb={
            "recent": fsb["recent"], "has_volume": fsb["has_volume"],
            "count_3y": len(fsb["all"])},
        divergence=div, accum_dist=ad, probability=prob, confidence=conf,
        sizing=sizing, invalidation=invalid, notes=notes)
