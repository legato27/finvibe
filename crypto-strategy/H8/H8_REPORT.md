# H8 report: pump distribution short

Run 2026-10-08 under `H8_GATE.md` (committed 3672364 before any data was fetched).

**Verdict: FAIL on design.** No variant reached the 30 trades the gate requires on
the design period, so under the gate H8 fails without its test run. The test
period (2026-04-01 → 2026-09-30) was not touched and has no entry in
`h8_oos_ledger.jsonl`.

## Code fixes made before any run (rules unchanged)

| Commit | Fix | Why it is not a rule change |
|---|---|---|
| afdef80 | The 24h cooldown starts only on a full pump event | Rule 1 defines an event as all four conditions, OI included; the code had started the cooldown on price/volume candidates before checking OI |
| (this report's commit) | Archive paths URL-encoded | A symbol named `哈基米USDT` crashed the download; plumbing only |

The approximation kept and noted: "1 tick" is coded as 1 bp of price. Binance tick
sizes for delisted symbols are not available; at small-cap prices 1 bp is close to
one tick.

## Data

- 900 USDT perpetuals in the archive, delisted ones included; 5m klines
  2025-08 → 2026-09.
- Monthly universe: the previous month's top 30 by median daily quote volume
  excluded (13 months ranked).
- Per event: 1m klines, 5m OI (metrics), 5m premium index, funding settlements, and
  5m spot klines.
- Self-test passes, including a pump whose OI condition lags its price by one bar.

## Design (2025-10-01 → 2026-03-31)

| Variant | Rule | Pump events | Trades | Net R | Gross R | t | No setup |
|---|---|---|---|---|---|---|---|
| V1 | pump ≥ 15 %, OI rollover | 394 | 3 | +0.17 | +0.21 | 0.41 | 390 |
| V2 | pump ≥ 10 %, OI rollover | 589 | 9 | +0.10 | +0.13 | 0.50 | 578 |
| V3 | pump ≥ 20 %, OI rollover | 251 | 2 | +0.10 | +0.12 | 0.17 | 248 |
| V4 | pump ≥ 15 %, no OI rollover | 394 | 15 | +0.17 | +0.23 | 0.67 | 378 |

Chosen by rule (highest net R with n ≥ 30): **none** → fail on design. The positive
R on 2 to 15 trades means nothing at that n.

## Why almost no event produced a trade

A diagnostic replay of the setup step on the design events records, for each event,
the furthest entry condition it reached in its 6h window:

| Furthest condition reached | V1 | V4 |
|---|---|---|
| Premium not positive after the stall | 220 | 162 |
| Stop would be over 8 % | 156 | 203 |
| Premium positive but below its 90th percentile | 12 | 2 |
| No premium threshold (under 7 days of history) | 1 | 1 |
| Order placed, cancelled by a new high | 1 | 10 |
| **Filled** | **3** | **15** |
| Missing data | 1 | 1 |

Bar by bar across the windows (V1), the blocking conditions were:

| Condition | Bars blocked |
|---|---|
| OI not rolling over | 17,788 |
| Premium not positive | 5,640 |
| Not yet stalled | 1,852 |
| New high | 1,798 |
| Stop over 8 % | 649 |
| Premium below its 90th percentile | 454 |

The conditions are close to mutually exclusive in practice:
- **Premium.** A pump's perp premium is rich *during* the run-up. By the time the
  high has stalled for 15 minutes, arbitrage has usually closed it, so the perp
  trades at or below the index. The rule asks for a rich premium *after* the stall,
  which is rarely there.
- **OI rollover** at the stall is uncommon. Without it (V4), the premium becomes the
  binding check.
- **Stop width.** The pumps that keep a rich premium are the most volatile ones. For
  them, a stop of H + 0.5 × ATR above a stall low sits more than 8 % away, and the
  rule skips them rather than tighten the stop.

## What this means

H8 as written cannot be judged: its filters leave 2–15 trades in six months across
900 perps. The few trades it did take were mildly positive before costs, which is
not evidence of anything. The diagnosis points at the two conditions that do the
blocking (the premium measured after the stall, and the 8 % stop cap). Any variant
that relaxes them is a new hypothesis, H8b. It needs its own gate, committed
before it runs. Its choices are informed by this design-period diagnosis, so it
must be graded on the still-untouched test period (2026-04-01 → 2026-09-30) and on
nothing H8 has seen.

## Files

- Results: `data/crypto/_research/h8/results/design_V1..V4.csv` and
  `design_summary.json` (backend repo data folder).
- Desk → Scalp: the H8 panel shows the stages, the per-variant design table and
  this verdict (`/api/crypto-desk/h8`).
