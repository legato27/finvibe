# VibeFin — application summary

*Written 12 Sep 2026 for brainstorming. Self-contained: paste it into a chat and the reader has the whole picture.*

## What it is

VibeFin (repo `vibefin`, live at fin.vibelife.sg) is a quant research desk for a retail trader who trades their own book. It reads the market every day through a set of models, arbitrates them into one call, and lets the reader drill from that call down to a single name, a single option strike, or their own position. Nothing in it places an order. It is also an MCP server, so an AI assistant can call the same models the pages show.

The audience runs from a novice who wants the one-sentence reading under a number to an expert who wants the eighteen-column options desk table. Every feature is expected to serve both ends through progressive disclosure, and every feature must build on the shipped design system.

## The product, page by page

| Route | What the reader gets |
|---|---|
| **Today** `/` | The call first: a lean (lean in / stay balanced / lean out), one paragraph naming the regime, the risk score, which of four models lean where, the one signal to watch, then the top signal by conviction and what fired today. Under it, evidence: risk score with positioning by asset class, breadth, VIX with term structure, dealer gamma (GEX), business cycle wheel, swarm (crowd) indicator, cross-asset macro tape, the signals digest (new price-action triggers, verdict changes, conflicts), your watchlist at a glance, sector heatmap, sector rotation with regime-conditioned forecasts, crypto with fear and greed, the news wire. No card ever disappears; a card with no data keeps its place and says why. |
| **Screeners** `/ranked` `/multibagger` `/options` `/heatmap` | One hub with four question cards. *Ranked Book*: watchlist names scored cross-sectionally on six factors (momentum, ML forecast, quality, value, moat, low volatility) into Long / Neutral / Short quintiles, with the arbitrated verdict shown beside the quant rank so disagreements stand out. *Multibaggers*: a whole-US-market scan in two tracks (established leaders, early breakouts) with a regime banner saying which track today favours, plus a performance scorecard. *Sell options*: per-name IV rank, expected move, put/call ratio, skew, unusual open interest and a recommended premium strategy. *Market heatmap*: every S&P 500 and Nasdaq-100 name as a treemap or table, sized and coloured by the metric you pick, with deep links per sector. |
| **Stock** `/stock/[ticker]` | One scrolling page. Left: price chart with price-action levels and structure (monthly, weekly, daily), the verdict card with its evidence and vetoes, FinVibe's thoughts (LLM analysis with intrinsic value and margin of safety) and DCF scenarios, then options chain and quant models as collapsed sections, then sentiment. Right: your exposure (held or not, shares, cost, P&L, which lists carry it), dated events (earnings, dividends), news for the ticker, and the MCP calls that return the same report. When the ticker is held, position advice, a position-aware options recommendation and the transaction history appear. |
| **Watchlist** `/watchlist` | Multiple lists. One table with search, group-by (sector, industry, moat, verdict, price-action direction), sortable columns for price, margin of safety, fair value, AI margin of safety, trend, verdict, price-action setup, swing levels and option strategy. Add to portfolio from a row. |
| **Portfolio** `/portfolio` | Multiple portfolios, multi-currency with FX conversion to a default currency, lots with broker and notes, sells, an AI risk analysis of the whole book, and a holdings table with P&L and return. |
| **Desk** `/desk` | The options income workflow. Sell puts or covered calls. Two hard gates (Altman solvency, strike liquidity) then a weighted score (IV percentile 30%, Piotroski F-score 25%, Ornstein-Uhlenbeck z-score 20%, annualised return 15% capped, margin of safety 10%), with missing inputs redistributed rather than scored zero and funds judged on structure instead of solvency. Above the ranked table: *what fits in the book* (enter collateral, get a breadth-first paper allocation under per-name and per-correlation-bucket caps), *covered-call book* (your holdings joined to resistance levels and your cost basis, in the browser), *trade journal*, *assignment backtest* (five years of candles, 93k simulated entries: how often assigned, how bad, how often recovered), and *what the engine actually called* (every logged recommendation graded at expiry, with calibration). |
| **Settings** | Profile, security, sign-out everywhere, login history, default currency, background job runs, and the MCP page: personal tokens, OAuth clients and grants, the tool catalog. |

## The engines behind it

All models run on a backend box (an Nvidia DGX at home, FastAPI, Python, Postgres, Celery beats) and are read by the frontend through a proxy.

- **Regime**: a synthesised daily "today" call with a risk score from -100 to +100, score components (VIX, VIX term structure, breadth, GEX, swarm), positioning by asset class, and key signals. A four-state hidden-Markov business cycle. A VIX zone model with term structure. Dealer gamma exposure with the zero-gamma level.
- **Swarm**: a crowd model over ~50 names giving a herding score, noise ratio, cluster count, density delta and the driving factors.
- **Verdict engine**: per-ticker arbitration across the quant ensemble, price action, the ranked book, sentiment and the LLM thoughts into six states (strong long to strong short, plus *conflicting*), with confidence, vetoes (earnings window, high-vol regime, model disagreement, Altman distress, thin evidence), and levels (entry zone, invalidation, target).
- **Price action (PAM)**: structure and setups on monthly, weekly and daily timeframes (UC/DC continuation and reversal setups, force-strike bars, sweet spots, divergence), a trade plan with reward-to-risk, and swing levels.
- **Quant models per ticker**: an ML ensemble forecast, gradient-boosted models, GARCH volatility, DCF with scenarios and sensitivity, Piotroski, Altman, OU mean-reversion.
- **LLM thoughts**: a generated narrative per ticker with an AI intrinsic value, margin of safety, moat and sector, regenerated on verdict change.
- **Options**: chain, expiries, summary (IV rank with history, ATM IV, expected move, PCR, max pain, skew), a strategy log, the screener, the desk grading, an open-recommendation scorecard.
- **Backtests**: per-ticker strategy backtests, a backtest watchlist with an auto-research loop (experiments, leaderboard, favourites, promote), and a Bitcoin market-maker module (liquidity map, sessions, setups).
- **Sentiment and news**: scored headlines per ticker with reasoning, a sentiment gauge, a market-wide wire.
- **Heatmap**: index membership and security reference refreshed on a schedule, sector rollups.
- **Enrichment**: names are enriched (models, thoughts, verdict) on demand and by a sweep; the queue is capped at about twenty names a day because it is GPU and LLM time.

## Architecture

- **Frontend**: Next.js 16 App Router, React 18, TypeScript, Tailwind, TanStack Query, next-intl (single English message file, all copy centralised), Recharts, lightweight-charts, d3. Deployed on Vercel from `main`; every push to `main` is a production deploy.
- **Backend**: the DGX box, reached through a Cloudflare tunnel. The frontend never calls it directly from the browser: a catch-all proxy route in the app forwards allowlisted paths, sets edge-cache headers, and records freshness.
- **Supabase**: auth (email and GitHub), accounts, watchlists, portfolios, holdings, sells, options trades, portfolio analyses, LLM analysis mirror, MCP tokens and OAuth, staging snapshots, enrichment requests, backend health incidents. Row-level security everywhere; 23 migrations.
- **Three tiers of resilience** when the backend is down: Supabase-native data is unaffected; every allowlisted GET is edge-cached with stale-while-revalidate; and a staging tier in Supabase holds pushed snapshots (verdict, price action, option summary, model results, thoughts) plus captured responses for everything else, each with its own serving window (an option chain three days, a multibagger scan fourteen). A response served from staging carries a header, and the header drives a freshness chip in the app header that turns amber and names the stale data. Past its window a copy is not served; the caller sees the real failure.
- **MCP server**: `/api/mcp/mcp`, streamable HTTP, bearer tokens (hashed) or OAuth. About thirty tools: profile, watchlists, portfolios, holdings, sells, search, stock info and price, price history, today's signals, macro today, FX, price action, option expiries and chains and summary, the options screener, news, sentiment, multibagger candidates, verdict, LLM thoughts, enrich. Every query is scoped to the token's user.
- **Cron**: a backend health probe and scheduled refreshes on the box.

## The design system (shipped 12 Sep 2026)

A lime-on-void terminal in both light and dark, following the OS. Chivo for interface text, JetBrains Mono for every figure, ticker, tool name and section label. Colour is declared in exactly two files, and a lint that runs before every build fails on any colour literal elsewhere, so the next reskin is a token edit. Seven primitives carry every surface: Panel (label · qualifier / body / one-sentence reading), Stat, Segmented, Chip, VerdictBadge, Freshness, DataTable (search, group-by, sticky header, optional columns, phone card fallback), plus Disclosure and ConfirmDialog.

Page grammar: the answer first, evidence under it, a sentence under the numbers saying what they mean, panels that never return null, and every card linking to where the reader would act. Five nav destinations: Today, Screeners, Watchlist, Portfolio, Desk. Settings and connectors under the account menu.

## Constraints worth knowing

- Market data is 15-minute delayed, and the current plan returns no bid/ask, so every option return is a mid-fill upper bound.
- Enrichment is capped near twenty names a day; the ~260 index names outside the enriched book render on the heatmap as hatched, price-only tiles.
- The book's sector labels mix two taxonomies; the heatmap normalises to eleven GICS sectors, and anything else grouping by sector should do the same.
- The backend type for VIX lacks the 52-week fields the frontend reads, three long-standing type errors that the build ignores.
- No alerts engine, no agent chat, no broker execution, no correlation clusters of the user's book, no factor exposure of the book. These appeared in the design mock and were deliberately kept out of the reskin.

## What might come next (starting points, not decisions)

- **Alerts**: standing rules on price, IV rank, verdict change or price-action trigger, delivered by email or push, with the rule shown on the watchlist row. The mock drew it; the data exists.
- **Book-aware risk**: correlation clusters and factor exposure of the user's actual holdings, feeding the Today call ("your two largest positions sit in one risk bucket").
- **An agent surface**: the MCP tools already exist; a chat panel inside the app that calls them and drafts a plan for approval is the mock's headline.
- **Broker read-through**: import positions from a broker connector (an IBKR MCP already exists on the user's side) so the portfolio and covered-call book are always current.
- **Backtest to desk**: promote a favourite backtest strategy into a standing screener or a desk rule set.
- **Journal analytics**: turn the trade journal into a track record of the reader's own decisions versus the engine's calls.
- **Notebook views for novices**: a guided morning read that walks the Today page top to bottom with one question per panel, then hides itself.

## Facts for orientation

- Repo started April 2026; 267 commits by 12 Sep 2026. Solo maintainer with an AI pair.
- Design note with the theme, primitives, page plans and the reskin record: claude.ai/code/artifact/5e19abad-e6ec-4d67-aff3-cfeaf9cfe42c
- The skin contract lives in `docs/skin.md`; the staging tier in `docs/data-planes.md`; the MCP API in `docs/mcp.md`.
