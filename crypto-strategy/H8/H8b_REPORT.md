# H8b report: pump short, premium judged at the pump

Run 2026-10-08/09 under `H8b_GATE.md` (committed bd4d53f before any H8b run).

**Verdict: FAIL on the test period.** Three of eight gate checks passed. The chosen
variant, B3, took 42 trades in six months against the 100 required, averaged +0.05R
net against +0.10R, with t = 0.60 against 2. One trade carried 57 % of all the
profit; without it B3 averaged +0.02R. H8b does not replace the halted scalp setups.

## Design (2025-10-01 → 2026-03-31)

| Variant | Rule | Trades | Net R | Gross R | t |
|---|---|---|---|---|---|
| B1 | OI rollover, stop ≤ 8 % | 24 | +0.09 | +0.11 | 0.75 |
| B2 | no OI rollover, stop ≤ 8 % | 44 | −0.18 | −0.16 | −1.39 |
| **B3** | **OI rollover, stop ≤ 15 %** | **54** | **+0.03** | **+0.04** | **0.34** |
| B4 | no OI rollover, stop ≤ 15 % | 82 | −0.12 | −0.11 | −1.55 |

589 pump events per variant. 370 were not rich at the pump (rule 2), and the rest
ended in no setup or a trade. Chosen by rule (n ≥ 30 and net R > 0, highest net R):
**B3**.

- **Moving the premium check worked as intended:** B1 took 24 trades where H8's
  equivalent (V2) took 9.
- **The added trades did not add edge.** Every variant without the OI rollover lost
  money, and B3's +0.03R at t 0.34 was already indistinguishable from zero before
  the test.

## Test (2026-04-01 → 2026-09-30), B3, one run

| Check | Result | Needed | OK |
|---|---|---|---|
| Trades | 42 | ≥ 100 | ✗ |
| Net R a trade | +0.051 | ≥ +0.10 | ✗ |
| t on daily sums | 0.60 | ≥ 2 | ✗ |
| Thirds | +1.35 / +0.95 / −0.13 R | 2 of 3 > 0 | ✓ |
| Net R with fees × 1.5 | +0.047 | ≥ 0 | ✓ |
| Largest symbol's share of profit | 57 % | ≤ 40 % | ✗ |
| Largest trade's share of profit | 57 % | ≤ 15 % | ✗ |
| Worst trade | −1.02R | ≥ −3R | ✓ |

**Other figures:**
- **Pump events:** 414 from 39 symbols. 277 were not rich at the pump and 95 ended
  in no setup. Of 24,551 price/volume candidate bars, 18,366 failed the OI
  condition.
- **Trade shape:** 74 % of trades won net, and 81 % reached TP1. The median trade was
  +0.08R, which means many small wins: half the position comes off at TP1 and the
  rest trails out near breakeven.
- **Costs:** fees averaged 0.01R a trade and funding was negligible. Costs are not
  why it fails; the edge is too small and too concentrated.
- **The whole six months summed to +2.16R.** One trade, BROCCOLIF3BUSDT on
  2026-07-27, made +1.24R of it. Without that trade the mean is **+0.023R** (n=41).

### Slippage sensitivity (required by the gate, no ledger entry)

At 10 bps per taker fill instead of 5: n 42, net **+0.043R**, gross +0.052R, t 0.50.
The verdict is unchanged.

### Three trades checked against raw 1m bars

Each was checked against the frozen rules on the archive's 1m klines:

| Trade | What the bars show | Result |
|---|---|---|
| BROCCOLIF3BUSDT 2026-07-27 (best, +1.24R) | The fill minute opened at 0.00917 above the trigger and wicked to 0.007486, so the fill came at the trigger less slippage (0.0089946). TP1 traded through on the next minute. The stop at 0.00996 was never touched; the rest trailed out at 20:47. | consistent |
| IRENUSDT 2026-07-30 (worst, −1.02R) | The fill minute's low of 37.11 reached the trigger of 37.21. TP1 at 35.71 was never reached. The stop at 38.06 was first touched in the exit minute (high 38.21), giving a slightly worse than −1R fill after slippage and fees. | consistent |
| 1000SATSUSDT 2026-08-01 (median, +0.09R) | The fill minute's low reached the trigger. TP1 traded through the next minute, then the stop moved to breakeven; the rest exited at 02:00. | consistent |

The universe takes every USDT perp, as the gate says. It therefore includes newer
tokenised-stock and meme listings (IREN, BROCCOLIF3B), and the gate did not exclude
them.

## What H8 and H8b established

- **The pump-fade idea has a real shape but no tradable edge at this size.**
  - Fading a stalled pump wins often: 74 % of trades won, and 81 % reached the first
    target.
  - But the average is ~0R once one outlier is removed, and the setup is rare:
    42–54 trades in six months across ~900 perps.
- **The conditions that make it rarer are the ones that keep it near break-even.**
  Removing the OI rollover doubled the trades and turned them negative (B2, B4).
- **The April–September 2026 test period is now spent** for the pump-fade family. A
  further variant would need fresh data: forward paper trading, or a period before
  2025-08 backfilled from the archive.

## Files

- `data/crypto/_research/h8/results/design_summary_H8b.json`,
  `design_H8b_B1..B4.csv` and `test_H8b_B3.csv` (backend data folder).
- `h8_oos_ledger.jsonl`: one H8b entry, B3, FAIL.
- Desk → Scalp: the H8b panel shows the stages, the design table, every gate check
  and the trades' R curve (`/api/crypto-desk/h8?hyp=H8b`).
