#!/usr/bin/env python3
"""H8 - pump distribution short. Standalone backtester. Rules: docs/crypto/H8_GATE.md.

Commit H8_GATE.md BEFORE running `fetch`. Then:
  python h8_pump_fade.py selftest              # fill/exit logic on synthetic bars
  python h8_pump_fade.py fetch                 # 5m perp klines, all USDT perps incl. delisted
  python h8_pump_fade.py design                # V1-V4 on the design period (2025-10 -> 2026-03)
  python h8_pump_fade.py oos --variant V?      # ONE run on the test period (2026-04 -> 2026-09)

Env: H8_CACHE (default data/crypto/_research/h8), H8_LEDGER, H8_WORKERS.
"""
import argparse, json, math, os, re, sys, time, zipfile, urllib.request, urllib.error
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd

BASE = "https://data.binance.vision/"
BUCKET = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
CACHE = os.environ.get("H8_CACHE", "data/crypto/_research/h8")
LEDGER = os.environ.get("H8_LEDGER", "data/crypto/_research/h8_oos_ledger.jsonl")
WORKERS = int(os.environ.get("H8_WORKERS", "16"))

PERIODS = {"design": ("2025-10-01", "2026-04-01"), "test": ("2026-04-01", "2026-10-01")}
FETCH_MONTHS = ("2025-08", "2026-09")  # lookback for 7d medians, 30d premium, universe rank

VARIANTS = {
    "V1": dict(thr=0.15, oi_rollover=True),
    "V2": dict(thr=0.10, oi_rollover=True),
    "V3": dict(thr=0.20, oi_rollover=True),
    "V4": dict(thr=0.15, oi_rollover=False),
}
P = dict(vol_mult=8.0, oi_up=0.30, min_qv24=5e6, top_n_excl=30, min_age_days=7,
         cooldown_h=24, setup_window_bars=72, stall_min=15, break_window_min=60,
         atr_mult=0.5, max_stop_pct=0.08, tp1_frac=0.382, trail_bars=15, time_stop_min=240,
         prem_pct=0.90, prem_min_bars=2016, taker=0.0005, maker=0.0002, slip=0.0005, tick=1e-4)
M5, M1 = pd.Timedelta(minutes=5), pd.Timedelta(minutes=1)
KCOLS = ["open_time", "open", "high", "low", "close", "volume", "close_time",
         "quote_volume", "count", "tbv", "tbqv", "ignore"]


# ---------------------------------------------------------------- data access
def get(rel):
    """Download BASE+rel into the cache once. Returns local path or None on 404."""
    path = os.path.join(CACHE, "raw", rel)
    if os.path.exists(path):
        return path
    if os.path.exists(path + ".404"):
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(BASE + rel, timeout=60) as r:
                data = r.read()
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
            return path
        except urllib.error.HTTPError as e:
            if e.code == 404:
                open(path + ".404", "w").close()
                return None
            time.sleep(2 ** attempt)
        except Exception:
            time.sleep(2 ** attempt)
    raise RuntimeError("download failed: " + rel)


def read_zip(path, header):
    with zipfile.ZipFile(path) as z:
        return pd.read_csv(z.open(z.namelist()[0]), header=header, low_memory=False)


def parse_klines(raw):
    raw = raw[pd.to_numeric(raw[0], errors="coerce").notna()].iloc[:, :12].copy()
    raw.columns = KCOLS
    t = pd.to_numeric(raw["open_time"]).astype("int64").to_numpy()
    t = np.where(t > 10 ** 14, t // 1000, t)  # spot files from 2025 use microseconds
    df = raw[["open", "high", "low", "close", "quote_volume"]].astype("float64")
    df.index = pd.to_datetime(t, unit="ms", utc=True)
    return df


def load_klines(rels):
    frames = [parse_klines(read_zip(p, None)) for p in map(get, rels) if p]
    if not frames:
        return None
    df = pd.concat(frames).sort_index()
    return df[~df.index.duplicated()]


def months(a, b):
    y, m = map(int, a.split("-"))
    Y, M = map(int, b.split("-"))
    out = []
    while (y, m) <= (Y, M):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def list_symbols():
    p = os.path.join(CACHE, "symbols.json")
    if os.path.exists(p):
        return json.load(open(p))
    prefix, marker, syms = "data/futures/um/monthly/klines/", "", []
    while True:
        url = f"{BUCKET}?delimiter=/&prefix={prefix}" + (f"&marker={marker}" if marker else "")
        xml = urllib.request.urlopen(url, timeout=60).read().decode()
        found = re.findall(r"<Prefix>" + re.escape(prefix) + r"([^/<]+)/</Prefix>", xml)
        syms += found
        if "<IsTruncated>true</IsTruncated>" not in xml or not found:
            break
        nm = re.search(r"<NextMarker>([^<]+)</NextMarker>", xml)
        marker = nm.group(1) if nm else prefix + found[-1] + "/"
    syms = sorted({s for s in syms if s.endswith("USDT") and "_" not in s})
    os.makedirs(CACHE, exist_ok=True)
    json.dump(syms, open(p, "w"))
    return syms


def perp5m(sym):
    p = os.path.join(CACHE, "perp5m", sym + ".pkl")
    if os.path.exists(p):
        return pd.read_pickle(p)
    df = load_klines([f"data/futures/um/monthly/klines/{sym}/5m/{sym}-5m-{m}.zip"
                      for m in months(*FETCH_MONTHS)])
    os.makedirs(os.path.dirname(p), exist_ok=True)
    pd.to_pickle(df, p)
    return df


def spot_symbol(sym):
    return re.sub(r"^(1000000|1000|1M)", "", sym)


def event_data(sym, t0):
    """1m perp bars, 5m OI, 5m premium index, funding settlements, 5m spot bars."""
    days = pd.date_range((t0 - pd.Timedelta(hours=3)).normalize(),
                         (t0 + pd.Timedelta(hours=12)).normalize(), freq="D").strftime("%Y-%m-%d")
    mo = t0.strftime("%Y-%m")
    prev = (t0.replace(day=1) - pd.Timedelta(days=1)).strftime("%Y-%m")
    nxt = (t0.replace(day=1) + pd.Timedelta(days=32)).strftime("%Y-%m")
    m1 = load_klines([f"data/futures/um/daily/klines/{sym}/1m/{sym}-1m-{d}.zip" for d in days])
    oi_parts = []
    for d in days:
        p = get(f"data/futures/um/daily/metrics/{sym}/{sym}-metrics-{d}.zip")
        if p:
            r = read_zip(p, 0)
            oi_parts.append(pd.Series(r["sum_open_interest"].astype(float).to_numpy(),
                                      index=pd.to_datetime(r["create_time"], utc=True)))
    oi = pd.concat(oi_parts).sort_index() if oi_parts else pd.Series(dtype=float)
    prem = load_klines([f"data/futures/um/monthly/premiumIndexKlines/{sym}/5m/{sym}-5m-{m}.zip"
                        for m in (prev, mo)])
    fund_parts = []
    for m in (mo, nxt):
        p = get(f"data/futures/um/monthly/fundingRate/{sym}/{sym}-fundingRate-{m}.zip")
        if p:
            r = read_zip(p, 0)
            fund_parts.append(pd.Series(r["last_funding_rate"].astype(float).to_numpy(),
                                        index=pd.to_datetime(r["calc_time"].astype("int64"), unit="ms", utc=True)))
    fund = pd.concat(fund_parts).sort_index() if fund_parts else pd.Series(dtype=float)
    ss = spot_symbol(sym)
    spot = load_klines([f"data/spot/monthly/klines/{ss}/5m/{ss}-5m-{m}.zip" for m in (prev, mo)])
    return dict(m1=m1, oi=oi, prem=None if prem is None else prem["close"], fund=fund, spot=spot)


# ---------------------------------------------------------------- stage 1: events
def universe(syms):
    """Month -> symbols excluded as top-N by median daily quote volume of the previous month."""
    p = os.path.join(CACHE, "universe.json")
    if os.path.exists(p):
        u = json.load(open(p))
        return {k: set(v) for k, v in u.items()}
    daily = {}
    for s in syms:
        df = perp5m(s)
        if df is not None and len(df):
            daily[s] = df["quote_volume"].resample("1D").sum()
    med = pd.DataFrame(daily).resample("MS").median()
    rank = med.rank(axis=1, ascending=False)
    excl = {}
    for i in range(1, len(rank)):
        prev = rank.iloc[i - 1]
        excl[rank.index[i].strftime("%Y-%m")] = sorted(prev[prev <= P["top_n_excl"]].index)
    json.dump(excl, open(p, "w"))
    return {k: set(v) for k, v in excl.items()}


def scan(sym, df, excl, start, end, thr):
    if df is None or len(df) < 3000:
        return []
    g = df.reindex(pd.date_range(df.index[0], df.index[-1], freq="5min"))
    c, qv = g["close"], g["quote_volume"].fillna(0.0)
    ret60 = c / c.shift(12) - 1
    vol1h = qv.rolling(12).sum()
    med7d = vol1h.shift(12).rolling(2016, min_periods=1500).median()
    qv24 = qv.shift(12).rolling(288).sum()
    age_ok = (g.index - df.index[0]) >= pd.Timedelta(days=P["min_age_days"])
    cond = (ret60 >= thr) & (vol1h >= P["vol_mult"] * med7d) & (qv24 >= P["min_qv24"]) & age_ok
    out, last = [], None
    for t in g.index[cond.fillna(False).to_numpy()]:
        if not (start <= t < end) or sym in excl.get(t.strftime("%Y-%m"), ()):
            continue
        if last is not None and t - last < pd.Timedelta(hours=P["cooldown_h"]):
            continue
        out.append(dict(sym=sym, t0=t))
        last = t
    return out


# ---------------------------------------------------------------- stage 2: trade
def atr(g, n=14):
    pc = g["close"].shift()
    tr = pd.concat([g["high"] - g["low"], (g["high"] - pc).abs(), (g["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()


def try_entry(m1, dec, trig, H):
    """Sell-stop below the stall low. A new high first cancels the setup."""
    w = m1[(m1.index >= dec) & (m1.index < dec + pd.Timedelta(minutes=P["break_window_min"]))]
    for ts, b in w.iterrows():
        if b.high > H:
            return ("invalid", ts, None)
        if b.low <= trig:
            return ("fill", ts, min(trig, b.open) * (1 - P["slip"]))
    return ("expired", dec + pd.Timedelta(minutes=P["break_window_min"]), None)


def manage(m1, fill_ts, fill, stop0, tp1):
    """Returns exit legs [(ts, px, qty, kind)], kind in taker/maker. Stop checked before target."""
    w = m1[m1.index >= fill_ts]
    stop, q, tp1_done, legs = stop0, 1.0, False, []
    highs = deque(maxlen=P["trail_bars"])
    tend = fill_ts + pd.Timedelta(minutes=P["time_stop_min"])
    for ts, b in w.iterrows():
        first = ts == fill_ts
        if ts >= tend:
            legs.append((ts, b.open * (1 + P["slip"]), q, "taker"))
            q = 0.0
            break
        if b.high >= stop:
            px = stop if first else max(stop, b.open)
            legs.append((ts, px * (1 + P["slip"]), q, "taker"))
            q = 0.0
            break
        if not tp1_done and not first and b.low < tp1 * (1 - P["tick"]):
            legs.append((ts, tp1, 0.5, "maker"))
            q, tp1_done, stop = 0.5, True, min(stop, fill)
        highs.append(b.high)
        if tp1_done:
            stop = min(stop, max(highs))
    if q > 0:  # data ran out
        legs.append((w.index[-1], w["close"].iloc[-1] * (1 + P["slip"]), q, "taker"))
    return legs


def price_trade(fill_ts, fill, stop0, legs, fund, m1, fee_mult):
    fees = fill * P["taker"] * fee_mult
    gross = 0.0
    for ts, px, q, kind in legs:
        gross += (fill - px) * q
        fees += px * q * P[kind] * fee_mult
    funding = 0.0
    exit_ts = legs[-1][0]
    for ts_f, rate in fund[(fund.index > fill_ts) & (fund.index <= exit_ts)].items():
        q_open = 1.0 - sum(q for t, _, q, _ in legs if t <= ts_f)
        mark = m1["close"][m1.index <= ts_f].iloc[-1]
        funding += rate * mark * q_open  # short receives positive funding
    net = gross - fees + funding
    risk = stop0 - fill
    return dict(r_gross=gross / risk, r_net=net / (risk + fees), fees_r=fees / risk, funding_r=funding / risk)


def simulate(ev, g, var, E=None):
    sym, t0 = ev["sym"], ev["t0"]
    E = E or event_data(sym, t0)
    m1, oi, prem, fund, spot = E["m1"], E["oi"], E["prem"], E["fund"], E["spot"]
    if m1 is None or prem is None or len(oi) == 0:
        return dict(sym=sym, t0=t0, skip="missing_data")

    def oi_at(ts):
        s = oi[oi.index <= ts]
        return s.iloc[-1] if len(s) else np.nan

    dec0 = t0 + M5
    if not oi_at(dec0) >= (1 + P["oi_up"]) * oi_at(dec0 - pd.Timedelta(hours=2)):
        return dict(sym=sym, t0=t0, skip="oi_not_up")
    hour = (t0 - 11 * M5, t0)
    perp_qv = g["quote_volume"][hour[0]:hour[1]].sum()
    if spot is not None and spot["quote_volume"][hour[0]:hour[1]].sum() > perp_qv:
        return dict(sym=sym, t0=t0, skip="spot_led")

    i0 = g.index.get_loc(t0)
    pump = g.iloc[i0 - 11:i0 + 1]
    H, L, last_high_t = pump["high"].max(), pump["low"].min(), pump["high"].idxmax()
    A = atr(g)
    phist = prem[(prem.index > t0 - pd.Timedelta(days=30)) & (prem.index <= t0 - pd.Timedelta(hours=1))]
    pthr = phist.quantile(P["prem_pct"]) if len(phist) >= P["prem_min_bars"] else np.nan
    j, jend = i0 + 1, min(i0 + 1 + P["setup_window_bars"], len(g))
    while j < jend:
        tj = g.index[j]
        if g["high"].iloc[j] > H:
            H, last_high_t = g["high"].iloc[j], tj
            j += 1
            continue
        if tj - last_high_t < pd.Timedelta(minutes=P["stall_min"]):
            j += 1
            continue
        dec = tj + M5
        ok = True
        if var["oi_rollover"]:
            o = oi[oi.index <= dec].iloc[-3:]
            ok = len(o) == 3 and bool((o.diff().iloc[1:] < 0).all())
        pr = prem[prem.index <= tj]
        ok = ok and len(pr) > 0 and pr.iloc[-1] > 0 and pr.iloc[-1] >= pthr
        if not ok:
            j += 1
            continue
        stall_low = g["low"][(g.index > last_high_t) & (g.index <= tj)].min()
        trig = stall_low * (1 - P["tick"])
        stop0 = H + P["atr_mult"] * A.iloc[j]
        tp1 = H - P["tp1_frac"] * (H - L)
        if (stop0 - trig) / trig > P["max_stop_pct"] or trig <= tp1:
            j += 1
            continue
        kind, ts, fill = try_entry(m1, dec, trig, H)
        if kind == "fill":
            legs = manage(m1, ts, fill, stop0, tp1)
            base = dict(sym=sym, t0=t0, fill_ts=ts, exit_ts=legs[-1][0], fill=fill, stop0=stop0,
                        tp1=tp1, tp1_hit=any(k == "maker" for *_, k in legs))
            base.update(price_trade(ts, fill, stop0, legs, fund, m1, 1.0))
            base["r_net_f15"] = price_trade(ts, fill, stop0, legs, fund, m1, 1.5)["r_net"]
            return base
        # invalid or expired: resume on the 5m bar containing ts
        j = max(j + 1, int(g.index.searchsorted(ts.floor("5min"))))
    return dict(sym=sym, t0=t0, skip="no_setup")


# ---------------------------------------------------------------- runs and gate
def run_period(period, vname):
    start, end = (pd.Timestamp(x, tz="UTC") for x in PERIODS[period])
    syms = list_symbols()
    excl = universe(syms)
    var = VARIANTS[vname]
    events = []
    for s in syms:
        events += scan(s, perp5m(s), excl, start, end, var["thr"])
    by_sym = {}
    for e in events:
        by_sym.setdefault(e["sym"], []).append(e)

    def work(s):
        g = perp5m(s)
        g = g.reindex(pd.date_range(g.index[0], g.index[-1], freq="5min")).ffill()
        return [simulate(e, g, var) for e in by_sym[s]]

    with ThreadPoolExecutor(WORKERS) as ex:
        rows = [r for rs in ex.map(work, sorted(by_sym)) for r in rs]
    return rows, start, end


def gate(rows, start, end):
    T = pd.DataFrame([r for r in rows if "skip" not in r])
    skips = pd.Series([r["skip"] for r in rows if "skip" in r]).value_counts().to_dict()
    out = dict(events=len(rows), n=len(T), skips=skips)
    if len(T) == 0:
        out["pass"] = False
        return out
    days = pd.date_range(start, end, freq="D", inclusive="left")
    daily = T.groupby(T["exit_ts"].dt.floor("D"))["r_net"].sum().reindex(days, fill_value=0.0)
    tstat = daily.mean() / (daily.std(ddof=1) / math.sqrt(len(daily))) if daily.std() > 0 else 0.0
    thirds = [float(x.sum()) for x in np.array_split(daily, 3)]
    total = T["r_net"].sum()
    sym_share = float(T.groupby("sym")["r_net"].sum().clip(lower=0).max() / total) if total > 0 else None
    evt_share = float(T["r_net"].max() / total) if total > 0 else None
    out.update(avg_r_gross=float(T["r_gross"].mean()), avg_r_net=float(T["r_net"].mean()),
               median_r_net=float(T["r_net"].median()), win_rate_net=float((T["r_net"] > 0).mean()),
               avg_fee_r=float(T["fees_r"].mean()), avg_funding_r=float(T["funding_r"].mean()),
               tp1_rate=float(T["tp1_hit"].mean()), worst_r=float(T["r_net"].min()),
               t_daily=float(tstat), thirds=thirds, avg_r_net_fees15=float(T["r_net_f15"].mean()),
               max_symbol_share=sym_share, max_event_share=evt_share, symbols=int(T["sym"].nunique()))
    checks = {
        "n>=100": out["n"] >= 100,
        "net_R>=0.10": out["avg_r_net"] >= 0.10,
        "t>=2": out["t_daily"] >= 2,
        "2of3_thirds_positive": sum(x > 0 for x in thirds) >= 2,
        "fees_x1.5>=0": out["avg_r_net_fees15"] >= 0,
        "symbol_share<=40%": sym_share is not None and sym_share <= 0.40,
        "event_share<=15%": evt_share is not None and evt_share <= 0.15,
        "worst_trade>=-3R": out["worst_r"] >= -3.0,
    }
    out["checks"], out["pass"] = checks, all(checks.values())
    return out


def save_trades(rows, tag):
    p = os.path.join(CACHE, "results", f"{tag}.csv")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    pd.DataFrame(rows).to_csv(p, index=False)
    return p


def cmd_fetch(_):
    syms = list_symbols()
    print(f"{len(syms)} USDT perps (incl. delisted)")
    with ThreadPoolExecutor(WORKERS) as ex:
        for i, _ in enumerate(ex.map(perp5m, syms)):
            if i % 50 == 0:
                print(f"  {i}/{len(syms)}", flush=True)
    excl = universe(syms)
    print("universe months:", len(excl))


def cmd_design(_):
    summary = {}
    for v in VARIANTS:
        rows, s, e = run_period("design", v)
        g = gate(rows, s, e)
        save_trades(rows, f"design_{v}")
        summary[v] = g
        print(f"{v}: events={g['events']} n={g['n']} net={g.get('avg_r_net', float('nan')):+.3f}R "
              f"gross={g.get('avg_r_gross', float('nan')):+.3f}R t={g.get('t_daily', float('nan')):.2f} skips={g['skips']}")
    ok = {v: g for v, g in summary.items() if g["n"] >= 30}
    pick = max(ok, key=lambda v: ok[v]["avg_r_net"]) if ok else None
    summary["_chosen"] = pick
    p = os.path.join(CACHE, "results", "design_summary.json")
    json.dump(summary, open(p, "w"), indent=2, default=str)
    print("chosen by rule (best net R with n>=30):", pick, "->", p)


def cmd_oos(a):
    v = a.variant
    if os.path.exists(LEDGER):
        for line in open(LEDGER):
            r = json.loads(line)
            if r.get("hypothesis") == "H8" and r.get("variant") == v:
                sys.exit(f"refused: H8/{v} already has a test run in {LEDGER}. A changed rule needs a new id.")
    rows, s, e = run_period("test", v)
    g = gate(rows, s, e)
    save_trades(rows, f"test_{v}")
    os.makedirs(os.path.dirname(LEDGER) or ".", exist_ok=True)
    with open(LEDGER, "a") as f:
        f.write(json.dumps(dict(hypothesis="H8", variant=v, period=PERIODS["test"],
                                ran_at=pd.Timestamp.now(tz="UTC").isoformat(), result=g), default=str) + "\n")
    print(json.dumps(g, indent=2, default=str))
    print("GATE:", "PASS" if g["pass"] else "FAIL")


# ---------------------------------------------------------------- self test
def _synthetic():
    """Flat at 1.00 for 8 days, +25% pump over 60 min, stall, slow bleed to 1.08."""
    idx = pd.date_range("2026-01-01", periods=8 * 1440 + 600, freq="1min", tz="UTC")
    px = np.ones(len(idx))
    p0 = 8 * 1440
    px[p0:p0 + 60] = np.linspace(1.0, 1.25, 60)          # pump
    px[p0 + 60:p0 + 90] = 1.245                          # stall near the high
    px[p0 + 90:p0 + 290] = np.linspace(1.245, 1.08, 200)  # dump
    px[p0 + 290:] = 1.08
    m1 = pd.DataFrame({"open": px, "high": px * 1.001, "low": px * 0.999, "close": px,
                       "quote_volume": np.where((idx >= idx[p0]) & (idx < idx[p0 + 60]), 5e6, 1e4)}, index=idx)
    m1["open"] = m1["close"].shift().fillna(1.0)
    g = m1.resample("5min").agg({"open": "first", "high": "max", "low": "min", "close": "last", "quote_volume": "sum"})
    t0 = idx[p0 + 55]  # 5m bar that completes the pump hour
    oi_idx = pd.date_range(idx[0], idx[-1], freq="5min")
    oi_vals = np.where(oi_idx < idx[p0], 100.0, np.where(oi_idx < idx[p0 + 75], 160.0, 0.0))
    oi = pd.Series(oi_vals, index=oi_idx)
    after = oi_idx >= idx[p0 + 75]
    oi[after] = 160.0 - np.arange(after.sum())  # rolling over
    prem = pd.Series(np.where(oi_idx < idx[p0], 0.0001 * np.sin(np.arange(len(oi_idx))), 0.002), index=oi_idx)
    fund = pd.Series([0.001], index=[idx[p0 + 180]])
    return m1, g, t0, dict(m1=m1, oi=oi, prem=prem, fund=fund, spot=None)


def cmd_selftest(_):
    # 1) microsecond spot timestamps parse to the same time as ms
    raw = pd.DataFrame([[1735689600000000, 1, 2, 0.5, 1.5, 10, 0, 15, 1, 0, 0, 0],
                        [1735689600000, 1, 2, 0.5, 1.5, 10, 0, 15, 1, 0, 0, 0]])
    k = parse_klines(raw)
    assert k.index[0] == k.index[1] == pd.Timestamp("2025-01-01", tz="UTC"), k.index
    # 2) entry: new high before the break cancels; break fills at trigger minus slippage
    idx = pd.date_range("2026-01-01", periods=5, freq="1min", tz="UTC")
    bars = pd.DataFrame({"open": [1.0] * 5, "high": [1.0, 1.0, 1.2, 1.0, 1.0], "low": [1.0, 1.0, 1.0, 0.8, 1.0],
                         "close": [1.0] * 5}, index=idx)
    assert try_entry(bars, idx[0], 0.9, 1.1)[0] == "invalid"
    k, ts, f = try_entry(bars, idx[0], 0.9, 1.3)
    assert k == "fill" and ts == idx[3] and abs(f - 0.9 * (1 - P["slip"])) < 1e-12
    # 3) stop before target when both are touched in the same bar
    idx = pd.date_range("2026-01-01", periods=3, freq="1min", tz="UTC")
    bars = pd.DataFrame({"open": [1.0, 1.0, 1.0], "high": [1.0, 1.06, 1.0], "low": [1.0, 0.9, 1.0],
                         "close": [1.0] * 3}, index=idx)
    legs = manage(bars, idx[0], 1.0, 1.05, 0.95)
    assert len(legs) == 1 and legs[0][3] == "taker" and abs(legs[0][1] - 1.05 * (1 + P["slip"])) < 1e-12
    # 4) end to end on a synthetic pump: one trade, TP1 hit, positive net R, funding received
    m1, g, t0, E = _synthetic()
    r = simulate(dict(sym="SYN", t0=t0), g, VARIANTS["V1"], E)
    assert "skip" not in r, r
    assert r["tp1_hit"] and r["r_net"] > 0 and r["funding_r"] > 0, r
    assert r["r_net"] < r["r_gross"], r
    rows = [r]
    g2 = gate(rows, pd.Timestamp("2026-01-01", tz="UTC"), pd.Timestamp("2026-01-10", tz="UTC"))
    assert g2["n"] == 1 and not g2["pass"]  # n=1 can never pass
    print("selftest OK:", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("selftest", "fetch", "design"):
        sub.add_parser(name)
    o = sub.add_parser("oos")
    o.add_argument("--variant", required=True, choices=sorted(VARIANTS))
    a = ap.parse_args()
    {"selftest": cmd_selftest, "fetch": cmd_fetch, "design": cmd_design, "oos": cmd_oos}[a.cmd](a)
