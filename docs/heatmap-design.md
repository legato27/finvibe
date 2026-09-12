# Market heatmap — design and data analysis

Design note, 2026-09-12. The interactive mock and the full write-up live in
the **VibeFin Market Heatmap** artifact; this file is the part a build session
needs in the repo.

**Status.** Phases 1 and 2 are built (backend alembic 036, `universe_tasks`,
`services/analytics/heatmap.py`, `GET /api/heatmap`; vibefin `PATH_FAMILIES`
entry). Phase 3, the page, is not. Phase 4 was decided: ship with the hatch,
do not enrich the 262 index-only names.

## What is being built

A treemap of every S&P 500 and Nasdaq-100 name, sized by market cap, colored by
any FinVibe signal, grouped by sector / industry / verdict / price-action read /
options strategy, and filtered by verdict, sector, cap band, IV rank, earnings
proximity and watchlist. It is the fifth Screener tab (`/heatmap`).

## What exists today

Measured 2026-09-12 against the DGX database, Redis and the live providers.
Scope is the 646 names in S&P 500 ∪ Nasdaq-100 ∪ the enriched book.

| Dimension | Source | Coverage | Status |
|---|---|---|---|
| Price, day change, day volume | Polygon full-market snapshot, one call, 13,183 tickers | 623 / 646 | exists, not wired |
| 1W–12M returns, 52-week distance | `mb:matrix:<date>` in Redis (12 months daily close+volume, 5,317 names, 20 MB parquet, rebuilt daily by the multibagger scan) | all | exists, not exposed |
| Market cap | Polygon ticker details, per name, cached 1 day in `md:ref:*` | 624 / 646 | not persisted |
| Index membership, weight | `watchlist_stocks.etf_memberships` via FMP etf-holder | **0 / 394** | dead source (429 / 401 on the current key) |
| GICS sector, sub-industry | Wikipedia S&P list, Nasdaq list, watchlist `sector` | 640 / 646 | 18 labels across two taxonomies |
| Verdict state / score / confidence | `verdict_json`, staged in `stock_verdict_snapshot` | 384 | book only |
| PAM setup / direction / conviction | `price_action_detail.synthesis`, staged | 384 (115 directional) | book only |
| Ranked-book composite z, percentile, factors | Redis `cross_sectional_ranked` | 367 | book only |
| Ensemble 3M return, POP; GARCH vol; Piotroski F; Altman Z | `model_results` | 378–384 | book only |
| Moat, intrinsic value, margin of safety | `watchlist_stocks` | 266 with a DCF | book only |
| ATM IV, expected move, PCR, unusual OI | `option_chain_summary`, staged | 378 | book only |
| IV rank / percentile | `iv_history` → option snapshot | 267 | book only |
| Options strategy / conviction / POP / annualised return | Redis `options_ranked` | 133 (vol-gated) | book only |
| Next earnings date | `watchlist_stocks` | 362 | book only |

S&P 500 ∪ Nasdaq-100 = 518 names. Book ∩ S&P 500 = 247, book ∩ Nasdaq-100 = 74,
union 256. The other 262 index names have no row anywhere on the box.

## The three gaps

1. **Index membership.** New table `index_membership(index, ticker, name,
   sector, sub_industry, weight, as_of)`, refreshed weekly. Sources verified
   reachable from the box:
   - S&P 500: `https://en.wikipedia.org/wiki/List_of_S%26P_500_companies`,
     table `#constituents` (503 rows; Symbol, Security, GICS Sector, GICS
     Sub-Industry, CIK). `BRK.B` → `BRK-B`.
   - Nasdaq-100: `https://api.nasdaq.com/api/quote/list-type/nasdaq100`
     (102 rows; needs `Origin: https://www.nasdaq.com` and a *plain browser*
     user agent — a UA carrying "FinVibe/1.0 (+url)" hangs to the timeout on
     every attempt). Wikipedia's Nasdaq-100 article no longer carries the
     component table. `https://stockanalysis.com/list/nasdaq-100-stocks/`
     answers 200 and would do as a fallback parser if Nasdaq's API goes away.
   - SPY weights: SSGA `holdings-daily-us-en-spy.xlsx` (200 OK, 54 KB).
     Invesco's QQQ download answers 406 to non-browser clients; weight
     Nasdaq-100 tiles by market cap.
2. **Market cap.** New table `security_reference(ticker pk, name, sector,
   security_type, market_cap, shares_outstanding, cik, composite_figi, as_of)`
   — the persisted form of the Polygon reference call, one writer, covering
   index ∪ book. Not columns on `watchlist_stocks`: 262 index names have no
   book row, and cap on two tables is two writers of one fact. Polygon's
   reference *list* returns neither cap nor shares on this plan; the
   per-ticker details call does. 650 calls at 50 ms spacing ≈ 35 s.
3. **Market data for names outside the book.** One composed endpoint,
   `GET /api/heatmap`, joins membership + snapshot + matrix returns + book
   analytics. Unenriched names return `tier: "market"` and no `signals` block.

Also: normalise sector to the 11 GICS names at the endpoint. Alias map for
book-only names: Technology→Information Technology, Financial
Services→Financials, Healthcare→Health Care, Basic Materials→Materials,
Consumer Defensive→Consumer Staples, Consumer Cyclical→Consumer Discretionary.

## Endpoint contract

```
GET /api/heatmap
{
  "as_of": { "market": ISO, "signals": ISO, "options": ISO },
  "indices": { "SPX": 503, "NDX": 102 },
  "rows": [{
    "ticker", "name", "sector", "sub_industry", "indices": ["SPX","NDX"],
    "weight": { "SPX": 7.9 }, "tier": "signals" | "market",
    "market": { "price", "chg_1d", "ret_1w", "ret_1m", "ret_3m", "ret_ytd", "ret_12m",
                "pct_from_52w_high", "rel_volume", "market_cap", "next_earnings" },
    "signals": { "verdict", "verdict_score", "verdict_confidence",
                 "pam": { "setup", "direction", "conviction", "monthly", "weekly" },
                 "ranked": { "composite_z", "percentile", "bucket" },
                 "ensemble_3m_pct", "prob_profit_pct", "garch_vol", "f_score", "altman_z",
                 "moat", "margin_of_safety", "range_10y" },
    "options": { "iv_rank", "atm_iv", "expected_move_30d", "pcr_oi",
                 "strategy", "conviction", "annualized_return_pct" }
  }]
}
```

Measured 2026-09-12: **668 KB** uncompressed for 623 rows (367 with signals),
6.5 s to compose uncached, instant from the Redis cache. Larger than the
250 KB first estimated because the signals block carries the full PAM and
ranked sub-objects; gzip on the proxy brings it under 100 KB. Shared public
data → allowlisted in
`src/lib/stagingPaths.ts` (`label: "heatmap"`, `maxAge: 3 days`,
`refreshAfter: 1 min`, `sMaxAge: 60`). Redis-cached on the box: 60 s during
the session, 15 min after the close. Watchlist filtering is client-side from
the user's own lists, as the ranked book does it.

## UI spec

- **Axes:** universe (S&P 500 / Nasdaq-100 / both / my book / a watchlist via
  `WatchlistPicklist`), group (sector, sector › industry, verdict, PAM read,
  options strategy, flat), size (market cap, equal, expected move, index
  weight), color (any metric in the table above).
- **Scales:** exactly three kinds. Diverging red·grey·green about zero or a
  stated midpoint (day change ±3 %, returns ±20 %, z ±2, margin of safety
  ±50 %, Altman Z 1.8–3.0, relative volume 0.5–1.5). Sequential single indigo
  ramp for magnitudes (IV rank, POP, conviction, F-score, range position).
  Status = existing verdict tokens (`--signal-long/short/neutral/conflict`,
  STRONG as the darker step; tile text carries the tier).
- **Missing metric** renders hatched, never zero, never the midpoint. The
  status line reports how many tiles carry the metric.
- **Tile:** ticker + metric value; ticker only under ~44 px wide; nothing
  under ~22 px. Hover = full parameter card with per-tier freshness. Click →
  `/stock/[ticker]`. Watchlist star on the card. Group label shows the
  cap-weighted day change of the group.
- **Filters** via `ColumnFilters` definitions shared with a table view (also
  the mobile view under 640 px).
- **Rendering:** `d3-hierarchy` treemap (d3 7 is already a dependency),
  absolutely positioned divs, squarify ratio 1.1, paddingTop 17 for group
  labels. Both themes token-driven. `StaleDataBanner` as everywhere else.
- **i18n:** new `heatmap` namespace in `messages/en.json`; `nav.heatmap`.

## Build plan

1. **Done.** Box: alembic 036 (`index_membership`, `security_reference`),
   `universe_tasks.refresh_index_membership` (Sun/Wed 05:30 UTC),
   `universe_tasks.refresh_security_reference` (Mon–Fri 21:15 UTC). The ETF
   mapper reads SPY/VOO/QQQ from `index_membership` and logs FMP failures at
   WARNING instead of DEBUG.
2. **Done.** Box: `services/analytics/heatmap.py` + `GET /api/heatmap`
   (`?refresh=1` bypasses the 60 s / 15 min Redis cache); vibefin
   `PATH_FAMILIES` entry (`label: "heatmap"`, 3-day window, 60 s edge);
   health check lines for both beats and both tables. Tests:
   `tests/test_heatmap.py`, `tests/test_index_constituents.py`.
3. App: `/heatmap` page, treemap component, controls, tooltip, table view,
   i18n, both themes. ~2 days. The artifact mock is the reference.
4. Coverage decision: enrol the 262 unenriched index names (enrichment queue
   is capped at 20/day and each name runs the full GPU+LLM chain — needs a
   dedicated backfill task, ~2 weeks of nightly windows) or ship with the
   hatch.

## Open decisions

- Enrich the whole index or ship with the hatch.
- Nasdaq-100 weights by cap, or maintain a browser-emulating Invesco fetch.
- Refresh cadence: 60 s on the box, 5 min at the edge, manual refresh in UI.
- Second surface: a sector-level card on the dashboard once the endpoint exists.
