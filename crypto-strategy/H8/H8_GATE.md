# H8 gate: pump distribution short (pre-registration)

Status: **pre-registered, not run.** Commit this file before `h8_pump_fade.py fetch` touches any data.
Harness: `h8_pump_fade.py` (standalone, reads data.binance.vision). Results go to `H8_REPORT.md`, pass or fail.

## Disclosure
- No data on this universe has been looked at. The scalp lake covers the 30 top-OI symbols only, and those are excluded here.
- The idea comes from the general pump lifecycle (accumulation → ignition → distribution → dump) and from S2/C losing by fading the first leg too early. The parameters below were written before any data was seen.
- The test window overlaps H4's test window (2026-03-24 → 05-31) in calendar time but not in symbols.

## Universe
All Binance USDⓈ-M USDT perpetuals in the data.binance.vision archive, delisted ones included. Excluded each month: the top 30 by median daily quote volume of the previous month. Also excluded: symbols listed less than 7 days before the event.

## Periods
- Design: 2025-10-01 → 2026-03-31. Variants are compared here.
- Test: 2026-04-01 → 2026-09-30. Exactly one run, for the chosen variant only.

## Rule
Decisions are made at 5m bar closes; fills are simulated on 1m bars.

1. **Pump.** The 60-min return is at least `thr`. The 1h quote volume is at least 8× the 7-day median 1h quote volume (measured before the pump hour). The 24h quote volume before the pump hour is at least $5M. OI (contracts, 5m metrics) is up at least 30% over the 2h to the decision time. One event per symbol per 24h.
2. **Skip if spot-led.** Skip when the spot pair's quote volume in the pump hour exceeds the perp's (`1000X` maps to `X`). This replaces the "listing/announcement in prior 24h" filter, for which no data exists, together with the 7-day listing age above.
3. **Setup window.** The setup window lasts 6h after the trigger. A stall means 15 min without a new high (`H` = running pump high). The setup also needs:
   - (if `oi_rollover`) the last two 5m OI changes both negative;
   - the latest 5m premium index above 0 and at or above the 90th percentile of that symbol's 5m premium over the 30 days ending 1h before the trigger.
4. **Order.** A sell-stop at the stall low − 1 tick, where stall low is the lowest low since the high. It is cancelled by a new high or after 60 min, and scanning then resumes. No order is placed if the stop distance is over 8% (skipped, not tightened) or if the trigger is already at or below TP1.
5. **Stop.** `H + 0.5 × ATR14(5m)`, triggered on touch, filled at max(stop, open) + slippage. If stop and target are touched in the same minute, the stop is assumed first.
6. **Exits.**
   - TP1: half the position at `H − 0.382 × (H − L)` (L = pump-hour low), maker, filled only on a 1-tick trade-through and never in the fill minute. The stop then moves to breakeven.
   - Remainder: trailing stop = highest high of the last 15 completed 1m bars, ratchets down only.
   - Time stop: 4h from the fill.

## Variants (4)
| id | thr | oi_rollover |
|---|---|---|
| V1 | 15% | yes |
| V2 | 10% | yes |
| V3 | 20% | yes |
| V4 | 15% | no |

Chosen by rule: the highest design net R with n ≥ 30. If none has n ≥ 30, H8 fails on design.

## Costs and accounting
- Fees: taker 5 bps, maker 2 bps.
- Slippage: 5 bps per taker fill. This is wider than tier-1 because spreads on this universe are wider.
- Funding: actual settlements from the `fundingRate` files (real intervals), on the open quantity; shorts receive positive funding.
- R is all-in: (pnl − fees + funding) / (stop distance + fees).

## Gate (all must hold on the test run)
n ≥ 100 · net R ≥ +0.10 a trade · t ≥ 2 on daily R sums (calendar days, zeros included) · positive in 2 of 3 test thirds · net R ≥ 0 with fees × 1.5 · no symbol over 40% of profit · no single event over 15% of profit · worst trade ≥ −3R.

## Known limits
- 1m bars, not ticks. Stop-first ordering inside a minute is the conservative assumption.
- No order book data, so slippage is a flat assumption. Run sensitivity at 10 bps in the report and say so; it does not change the verdict.
- Funding for trades crossing into 2026-10 is missing if that month's file is not yet published.
- The harness reproduces only synthetic cases (`selftest`). Before trusting it, hand-check 3 trades from `results/design_V1.csv` against raw 1m bars (rule 4).

## If it passes
Paper trade under a new `ENGINE_VERSION`. Demote if the first 50 fills are below 0R net. No retuning before n = 50.
