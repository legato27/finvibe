# H8b gate: pump distribution short, premium at the pump (pre-registration)

Status: **pre-registered, not run.** Commit this file and the H8b code before
`h8_pump_fade.py design --hyp H8b` runs. The harness is the same script as H8
(`h8_pump_fade.py`, `--hyp H8b`). Results go to `H8b_REPORT.md`, pass or fail.

## Why H8b exists, and disclosure

H8 (`H8_GATE.md`, 3672364) failed on design: 394–589 pump events, only 2–15 trades
(`H8_REPORT.md`, c6cac15). Its rules were fine to run. Its entry conditions almost
never line up.

**Disclosure.** H8b's changes come from H8's **design-period** diagnosis: the count
of events stopped at each condition, and the outcomes of H8's 29 design trades
(gross R +0.10 to +0.23 per variant, n far too small to mean anything). The H8
diagnosis showed:
- the premium is rich *during* the run-up but usually gone 15 minutes after the
  high stalls;
- OI rarely rolls over at the stall;
- the pumps that stay rich often need a stop wider than 8 %.

**No test-period (2026-04-01 → 2026-09-30) data has been run or looked at by H8 or
H8b.** The H8 OOS ledger has no entry. H8b's design period is the same as H8's
and has been seen. Its test period has not.

## Universe and periods

Same as H8:
- **Universe:** all Binance USDⓈ-M USDT perps in the archive, delisted ones included.
  Each month, the previous month's top 30 by median daily quote volume are excluded,
  as are symbols listed less than 7 days before the event.
- **Design:** 2025-10-01 → 2026-03-31.
- **Test:** 2026-04-01 → 2026-09-30. Exactly one run, for the chosen variant only.

## Rule (changes from H8 in bold; everything else exactly as H8)

1. **Pump.** All four must hold, and there is one event per symbol per 24h, the
   cooldown starting only on a full event (as fixed in afdef80):
   - the 60-min return is at least **10 %** (fixed; H8 varied it);
   - the 1h quote volume is at least 8× the 7-day median 1h quote volume, measured
     before the pump hour;
   - the 24h quote volume before the pump hour is at least $5M;
   - OI is up at least 30 % over the 2h to the decision time.
2. **Skip if spot-led** (as H8). Also skip the event **unless the premium was rich
   at the pump.** The highest 5m premium-index close in the pump hour (the 12
   bars ending at the trigger bar) must be above 0 and at or above the 90th
   percentile of the symbol's 5m premium over the 30 days ending 1h before the
   trigger. It needs at least 7 days of premium history (2,016 bars), as H8 did.
3. **Setup window.** 6h after the trigger. A stall means 15 min without a new
   high; `H` is the running pump high.
   - If `oi_rollover`, the last two 5m OI changes must both be negative.
   - **There is no premium condition after the stall.** H8's post-stall premium
     check is removed and replaced by rule 2.
4. **Order.** A sell-stop at the stall low − 1 tick (coded as 1 bp, as in H8),
   cancelled by a new high or after 60 min, then scanning resumes. No order is
   placed if the stop distance is over **`max_stop`** (skipped, not tightened), or
   if the trigger is at or below TP1.
5. **Stop, exits, time stop:** exactly as H8.
   - Stop: H + 0.5 × ATR14(5m), on touch, filled at max(stop, open) + slippage;
     stop first when both stop and target fall in the same minute.
   - TP1: half at H − 0.382 × (H − L), maker, 1-tick trade-through, never in the
     fill minute. The stop then moves to breakeven.
   - Remainder: trailed at the highest high of the last 15 completed 1m bars.
   - Time stop: 4h from the fill.

## Variants (4)

| id | oi_rollover | max_stop |
|---|---|---|
| B1 | yes | 8 % |
| B2 | no | 8 % |
| B3 | yes | 15 % |
| B4 | no | 15 % |

**Chosen by rule:** the highest design net R among variants with n ≥ 30 **and**
design net R > 0. If none qualifies, H8b fails on design and the test period is
not run. This is stricter than H8, which did not require a positive design net R.

## Costs, accounting and gate

Identical to H8:
- **Costs:** taker 5 bps, maker 2 bps, slippage 5 bps per taker fill.
- **Funding:** from the archive's settlement files, applied to the open quantity;
  shorts receive positive funding.
- **R** is all-in: (pnl − fees + funding) / (stop distance + fees).
- **Gate on the single test run:** n ≥ 100 · net R ≥ +0.10 a trade · t ≥ 2 on
  daily R sums (zeros included) · positive in 2 of 3 test thirds · net R ≥ 0 with
  fees × 1.5 · no symbol over 40 % of profit · no single event over 15 % of
  profit · worst trade ≥ −3R.
- **Report:** slippage sensitivity at 10 bps, and 3 trades hand-checked against
  raw 1m bars.

The OOS ledger (`h8_oos_ledger.jsonl`) records the run with `hypothesis: H8b`, and
a second H8b run is refused.

## If it passes

Paper trade under a new `ENGINE_VERSION`. Demote it if the first 50 fills are below
0R net. No retuning before n = 50.
