# VibeFin Redesign — Technical Gap Analysis

Source design: `docs/VibeFin Site.html` (Claude Design bundle, conceptual/incomplete).
Existing app: Next.js 16 App Router, Tailwind, Supabase auth, MCP server.

## 1. New design language
- **Type:** IBM Plex Mono (numerics/labels) + IBM Plex Sans (body).
- **Aesthetic:** "MARKET TERMINAL" — dark default `#06070a`, amber accent `#ffb000`, mono ticker tape, terminal hero (`$ vibefin pulse --today`).
- **Theme:** dark + light via `[data-theme]` CSS variables (`--bg/--panel/--ink/--accent/--grn/--red`...). App already has a ThemeProvider, so this maps.
- **Verdict system** in design (`STRONG_LONG…CONFLICTING`) matches existing `verdict_engine` / VerdictBadge.

## 2. Information architecture — new vs existing
New top nav: **Market Dashboard · Screeners · Intelligence · Portfolios · Watchlists** (+ Sign in, theme toggle).
Existing top nav: Dashboard · Watchlist · Screeners · Portfolio · ⚙ Settings · Login.

| New view (state) | Existing route / feature | Status |
|---|---|---|
| `home` (marketing) | `MarketingLanding.tsx` | ✓ exists, restyle |
| `login` / `register` | `/login`, `/register` (GitHub login already built) | ✓ mapped |
| `dashboard` | `/` `DashboardView` + all dashboard cards | ✓ mapped |
| `screener → ranked` | `/ranked` | ✓ mapped |
| `screener → multibagger` | `/multibagger` | ✓ mapped |
| `screener → options` | `/options` | ✓ mapped |
| `intelligence → wire` | `/osint` (OsintFeed) | ✓ mapped (rebrand OSINT→Intelligence) |
| `intelligence → map` | `/osint/map` | ✓ mapped |
| `intelligence → timeline` | `/osint/timeline` | ✓ mapped |
| `portfolio` (multi, `pfTabs`) | `/portfolio` (+ list/create portfolios) | ✓ mapped |
| `watchlist` (multi, `wlTabs`) | `/watchlist` (+ multiple lists) | ✓ mapped |
| `stock` (analysis/txns/events/options) | `/stock/[ticker]`, `/portfolio/stock/[ticker]` | ⚠ tab set differs (see §4) |

## 3. GAP A — New design elements with NO existing feature (RAISE)
1. **Pro tier — `$19/mo` "Full terminal + alerts"** (`plans = [Free $0, Pro $19/mo]`).
   No billing/subscription/Stripe anywhere in the codebase. → Product decision needed.
2. **Freemium gating UI** — "MEMBERS SEE MORE", "Locked preview", "Unlock with a free account".
   App currently gates by auth (`public:true/false` nav), but has **no locked-preview pattern**. → New component + policy.
3. **Alerts** — Pro tier sells "alerts"; watchlist design shows an **Alert** column + "Manage alerts →".
   No alerts engine exists today. → New feature, likely out of scope for a reskin.

## 4. GAP B — Existing features NOT drawn in the (incomplete) design (PRESERVE + restyle)
1. **Settings suite (8 pages)** — profile, security, currency, job-runs, login-history + **MCP suite** (tokens, oauth grants, tools, guide). Absent from design. Must be kept and restyled; keep a ⚙ entry.
2. **OAuth / MCP server pages** — `/mcp`, `/oauth/consent`, `/authorize`, `/token`, `.well-known/*`. Plumbing; keep functionally, light restyle only.
3. **OSINT `actors/[id]` and `indices`** — not represented in the new "Intelligence" tabs (wire/map/timeline). Decide: fold in, keep as deep links, or drop.
4. **Stock detail tab mismatch:**
   - Existing: `chart · analysis(FinVibe's Thoughts) · options · quant · news`
   - Design: `analysis · transactions · events · options`
   - Reconcile: chart→inside analysis; quant→inside analysis factors; news→events tab; add transactions tab (TransactionHistory already exists). Net: no data lost, just reorganized.
5. **Dashboard richness** — design shows a subset; existing has more cards (BusinessCycleWheel, GEX, VIX, Swarm, SectorRotation, MacroTape, CryptoIndicators, LiveTerminal, breadth…). All present in design vocabulary → keep all, restyle.

## 5. Recommended approach
1. **Design-system foundation first:** add IBM Plex fonts, port the CSS-variable token set (dark+light) into Tailwind theme + globals, build base primitives (Panel, mono table, StatChip, chip/tab, ticker tape) so every page inherits automatically.
2. **App shell:** rebuild Navbar to the new 5-item nav + theme toggle + terminal wordmark; promote OSINT→"Intelligence" as top-level; keep ⚙ Settings.
3. **Restyle mapped pages** to the new tokens/components (dashboard → screeners → intelligence → portfolio → watchlist → stock).
4. **Preserve unmapped pages** (settings, MCP/OAuth, osint actors/indices) with the new tokens but unchanged behavior.
5. **Gating/Pro/Alerts:** treat per product decision — recommend **visual-only** (show pricing section + locked-preview styling, no real billing/alerts engine) for this pass unless told otherwise.

## 6. Decisions needed before coding
- Pro $19/mo + freemium gating: visual-only, or build real enforcement?
- Confirm: keep & restyle all unmapped existing pages (settings, MCP, osint actors/indices)?
- Stock tabs: adopt design's analysis/txns/events/options (folding chart+quant+news in)?
- Scope of this pass: full reskin of all pages, or shell + landing + dashboard first?
