# The staging tier

What to do when the DGX box is unreachable, and what has to be deployed for it
to work. Background and the measurements behind these choices are in the
**FinVibe Data Planes** artifact.

## The shape of it

Three tiers, in order of how much of an outage they survive:

| Tier | What it covers | Where it lives |
|---|---|---|
| Supabase-native | accounts, watchlists, portfolios, MCP grants, catalog prices | Supabase, unaffected |
| Edge cache | every allowlisted shared GET | Vercel CDN, `s-maxage` + `stale-while-revalidate=86400` **set by the proxy** |
| **Staging tier** | **the same allowlist, plus the batch columns and search** | **Supabase snapshot tables** |

The middle row used to be described as "the shared precomputed endpoints,
which already carry `stale-if-error` from the backend middleware". That had
a hole worth naming: those headers came **from DGX**. The instruction to
keep a copy for a day only ever arrived while the box was alive to send it,
and nothing in the repo pinned it. The directive is now set in
`src/lib/proxy.ts` from the family table in `src/lib/stagingPaths.ts`, so it
survives the origin it describes.

## What is staged

Two mechanisms, because the endpoints divide into two kinds.

**Pushed** — DGX composes it from a table it owns, so a task on the box
mirrors it (`supabase_sync.reconcile_*`). These are the 017 families:

| Endpoint | Supabase table | Serving window |
|---|---|---|
| `GET /api/stocks/{t}/verdict` | `stock_verdict_snapshot` | 10 days |
| `GET /api/stocks/{t}/price-action` | `stock_price_action_snapshot` | 10 days |
| `GET /api/options/{t}/summary` | `stock_option_summary_snapshot` | 3 days |
| `GET /api/models/{t}/results` | `stock_model_results_snapshot` | 14 days |
| `GET /api/stocks/{t}/thoughts` | `llm_analysis` (already mirrored) | 30 days |

**Captured** — the API composes it at request time, so mirroring it would
mean re-running that composition on a schedule for names nobody is looking
at. Instead the proxy writes each successful response through to
`dgx_response_snapshot` as it passes (019), and reads it back on failure.
The allowlist and its windows are `PATH_FAMILIES`; the shape is one row per
request path. This is what now covers the dashboard, `/detail`, `/info`,
FX, the screeners, the desk, chains, price history, events and sentiment.

Two special cases sit alongside it:

- **The batch reads** (`POST /api/stocks/{verdict,pam,prices}/batch`). A
  POST has no honest stale version and is excluded from the fallback in
  general — but these three are reads whose argument is a list too long for
  a query string, and excluding them by method was why the watchlist's
  verdict and PAM columns rendered empty during an outage *while the same
  verdicts sat staged in Supabase*. They are captured and served per
  ticker, so a capture taken from one watchlist partly answers a request
  from another. Prices are not captured at all: `stock_catalog.last_price`
  is already the mirror, and is the same number the row underneath renders.
- **Search** (`GET /api/stocks/search`). Answered from `stock_catalog`
  rather than from a capture — the query string is unbounded, so capturing
  per query would store one row per thing anyone ever typed and still miss
  the next one. Narrower than the live endpoint: during an outage you can
  find the ~400 names FinVibe knows, and not a name it has never seen.

Every row is shaped like the **API response**, not like the DGX schema, so
the fallback is a read and a header rather than a second serializer to keep
in step with the route. For a captured row that is true by construction: the
body stored is the body DGX sent.

Past its serving window a copy is **not served** — the caller gets the real
upstream failure. The windows are not uniform and should not be made so: an
option chain a week old is a wrong trade, an FX rate a week old is a rounding
error, and a multibagger scan a week old is the same scan.

Measured 2026-08-26: the pushed tier is **12.4 MB** of JSON across 1,542
rows. Supabase Pro allows 8 GB. Capacity was never the constraint, and the
captured tier is bounded by the same allowlist and swept by
`prune_response_snapshots()`.

## How a request falls back

`src/lib/proxy.ts` → on a network error or a 5xx from DGX, for a `GET` on a
staged path or one of the three batch `POST`s, it reads `src/lib/staging.ts`
and returns the staged body with:

```
X-FinVibe-Stale: <as_of>          # age of the DATA, not of the copy
X-FinVibe-Stale-Source: supabase-snapshot
X-FinVibe-Stale-Family: option chain
Cache-Control: no-store
```

`no-store` is not incidental. The edge cache is the fourth store that has to
agree with the other three; an `s-maxage` on a stale body would keep serving
it for minutes after the box came back, from a cache nothing on the box can
reach into.

A 404 or any 4xx is **not** a fallback trigger — that is DGX answering, and
papering over it would resurrect data the backend deliberately stopped
serving (a suspended symbol still showing a trade setup).

The axios interceptor in `src/lib/api.ts` records the header into
`src/lib/staleness.ts`, and `StaleDataBanner` renders it. The banner is
sticky and not dismissible.

### How long it waits first

A staged path is capped at **20s** on the tunnel, because a fallback that
fires after a minute of spinner is not one anyone experiences. That cap used
to be safe by accident: only fast endpoints were staged. Now that the
dashboard and the desk are, three families carry an explicit
`timeoutMs: 45s` — `/api/macro/dashboard`, `/api/options/desk`,
`/api/options/backtest/assignment` — because they legitimately take tens of
seconds when the box is healthy, and a fallback that fires on a healthy box
is worse than no fallback. Anything not staged still waits unbounded (to the
route's `maxDuration` of 60s); there is nothing to fall back to, so cutting
it short would only break working requests.

### The MCP server takes the same path

`src/lib/mcp/market.ts` re-used the proxy's Cloudflare Access plumbing and
none of its resilience: 17 tools calling DGX directly, reading the very
endpoints whose staged copies were already sitting in Supabase, and all of
them dying with the box. `dgxJson` now captures and falls back exactly as
`proxyToDgx` does.

One difference, and it is deliberate. The browser fallback is byte-identical
to a live response — transparency is the point, because `StaleDataBanner`
says the rest. An MCP client has no banner and the reader is a model, so on
the degraded path only, the payload is wrapped:

```json
{ "_stale": { "as_of": "…", "family": "option chain", "notice": "…" },
  "data": { … } }
```

A shape change is the lesser evil against an agent reading a three-day-old
chain as live and acting on it. Live responses are untouched.

### What is NOT covered

- **User-scoped routes** — `/api/watchlist`, `/api/portfolio`,
  `/api/backtest-watchlist`, `/api/enrich`, `/api/mcp`, `/api/settings`. The
  staged read runs with the service-role key, which bypasses RLS; a fallback
  that returned one user's rows to another would be far worse than the
  outage it covered. `NEVER_STAGE` refuses these before the allowlist is
  even consulted.
- **`/api/jobs/status`** — not user-scoped, deliberately excluded anyway. A
  staged job-status page would show yesterday's runs all green, which is the
  worst possible answer to "is the box alive".
- **Writes** — generate-thoughts, model runs, enrichment kicks, order
  instructions. These need the box.
- **A name FinVibe has never seen.** Search falls back to the catalog, so an
  outage means you cannot look up a symbol that has never been enriched.

## Knowing the box is down

The staging tier's success created this problem. Before it, an outage
announced itself — every page broke. Now the app keeps serving stored copies
behind an amber banner, which is the entire point and also means an outage
can run for hours unnoticed. The 7h19m one on 2026-08-25 was found by a
person opening the app.

**It runs on Vercel, never on the box.** The DGX host also runs n8n and the
whole compose stack, so anything hosted there is unavailable in exactly the
failure it would be reporting.

### Two triggers

- **Traffic** — `src/lib/proxy.ts` already knows: every fallback it serves,
  and every 5xx, is evidence. Instant, free, and driven by actual impact.
  Blind to the quiet hours.
- **Heartbeat** — `/api/cron/dgx-health` every 5 minutes (`vercel.json`).
  It probes `/api/jobs/status`, the one endpoint excluded from both the
  staging tier and the edge cache, and goes straight to DGX rather than
  through the proxy. A heartbeat that can be answered from a stored copy is
  not a heartbeat.

The heartbeat is also the reliable half of *recovery*: the proxy can only
close an incident from an instance that happened to see the failure, and
serverless instances do not live that long.

### Alerting exactly once

A dead box produces a flood of evidence — the dashboard alone fires ten
requests a minute per open tab, each a separate invocation with no memory of
the others. A pager storm is functionally the same as no alert at all, so
"is this a new outage" is decided in the database (`supabase/020`):

- a partial unique index on `((true)) where resolved_at is null` allows **at
  most one open incident**, so the first failing request opens it and the
  rest lose the race harmlessly;
- the right to send is **claimed** by an update that only succeeds once
  (`where notified_at is null`).

If the send then fails, `release_dgx_notification()` gives the claim back and
the next failure retries. Claiming before sending risks silence; sending
before claiming risks a storm; claiming with a release on failure risks
neither. Verified against 50 concurrent callers: exactly one alert.

### Channels

Whichever is configured fires, both may be, neither is an error:

| Env | Goes to |
|---|---|
| `ALERT_WEBHOOK_URL` | Slack, Discord, n8n, PagerDuty — anything taking a JSON POST |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | a phone |

The webhook body carries `text` **and** `content` with the same string,
because Slack reads the first and Discord the second — one payload, no
per-vendor branch. With no channel configured the incident is still recorded
and visible in the app; only the push is missing.

`CRON_SECRET` should be set: Vercel sends it as a bearer token, and without
it the heartbeat route is publicly callable. It also gates the test:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://fin.vibelife.sg/api/cron/dgx-health?test=1"
```

That sends a real message through the real channels without touching the
incident table — because otherwise the first test of the alerting path is
the outage itself.

## Retention — four stores, one purge

`reconcile_*` only ever upserts. Everything staged therefore needs its removal
declared somewhere:

- **Ticker deleted in Supabase** → declared foreign key, `on delete cascade`.
  The database cannot forget this one.
- **Ticker deleted on DGX** → `prune_snapshots_to_dgx()`, called from
  `scripts/purge_old_data.sh`'s cross-store section next to
  `repair_qdrant_events.py`. A cross-database pointer that no constraint can
  cover — the same unenforced-reference shape that stranded 30,317
  `osint_articles` rows on 2026-08-25.
- **Age** → deliberately *not* purged on a timer. `model_results` and
  `option_chain_summary` are purged on DGX by the KEYED rule, which keeps the
  newest row per key at any age; these tables hold exactly that. A flat timer
  here would make Supabase stricter than DGX and delete rows the purge
  preserves. Age is enforced at read time instead, per family, in the proxy.
  `_SNAPSHOT_HARD_TTL_DAYS` (180) is only for dead keys.

`dgx_response_snapshot` (019) sits outside all of that on purpose. Every row
is a cached response, not a mirror of a DGX record, so no purge on the other
side can strand one and there is no cross-store pointer to keep in step. It
needs only the ordinary "nothing has asked for this in a month" sweep:
`select public.prune_response_snapshots();` — safe to run from the same
cross-store section, or from anywhere, or not at all for a while.

Nothing schedules it, on purpose. Steady state is roughly one row per
allowlisted path per name — a few thousand rows, tens of MB against
Supabase Pro's 8 GB — so the sweep is hygiene, not pressure. What actually
accumulates is churn: `/api/options/desk` is keyed per collateral value and
`/price-history` per period/interval pair. If that ever matters, `pg_cron`
is available on the project (not installed) and one statement covers it:

```sql
create extension if not exists pg_cron with schema pg_cron;
select cron.schedule('prune-response-snapshots', '0 4 * * 0',
                     $$select public.prune_response_snapshots()$$);
```

Enabling an extension to tidy a few thousand rows is a worse trade than
running the select by hand twice a year, which is why it is written down
here rather than added to a migration.

## The enrichment queue

Enrichment used to be requested by writing `enrichment_status='pending'` onto
the shared `stock_catalog` row. With `insert to authenticated with check
(true)` in the RLS policy, that made the super-admin gate on `/api/enrich`
decorative: one insert with the browser's anon key enqueued the full GPU/LLM
pipeline, unattributed and unbounded.

Now:

- `public.enrichment_requests` — `requested_by not null`, no UPDATE policy for
  the requester, one open request per ticker (partial unique index).
- `file_enrichment_request()` RPC is the only supported way in. It caps by the
  **user named in the call**, regardless of which key called it — which is
  what keeps the MCP server's service-role path bounded.
- Caps: **20 per rolling 24 h**, **3 in flight**. To return to admin-only,
  set both to `0` in `supabase/018` — non-admin asks then come back as
  `capped` instead of silently doing nothing.
- `enrichment_status` on `stock_catalog` survives as a **display badge**.
  Nothing schedules work off it, so a forged `pending` costs a misleading
  badge, not a GPU hour.

### Webhook, with the poll behind it

The poll was outbound, and outbound is the direction that actually fails here:
480 of 480 polls errored with `Errno -3` on 2026-08-01 and again on
2026-08-07, while the inbound tunnel stayed healthy throughout. So:

`INSERT on enrichment_requests` → Supabase DB webhook →
`POST /api/hooks/enrichment-request` on Vercel → DGX through the tunnel.

`poll_enrichment_requests` still runs on DGX every **10 minutes** as the
backstop, and reaps stranded work on the way past: a claim held longer than
30 minutes is released back to `queued`, and a request with no result after
6 hours is marked `failed`. Both matter because of the partial unique index —
one row stuck at `processing` would otherwise block that ticker from ever
being re-requested, by anyone.

## Deploying this

Order matters. **Migrations first** — until they are applied, DGX no longer
reads the old queue and enrichment stops. All three tasks detect the missing
tables and say so explicitly in `job_runs` rather than failing obscurely.

1. **Supabase SQL editor** — run `supabase/017_dgx_snapshots.sql`, then
   `supabase/018_enrichment_requests.sql`, then
   `supabase/019_response_staging.sql`. 018 backfills any rows still sitting
   at `enrichment_status='pending'` into the new queue so no outstanding
   request is dropped. 019 is additive — a table, two functions, no data
   migration — and until it is applied the capture logs a warning per
   request and the app behaves exactly as it did before.
2. **Vercel env** — `SUPABASE_WEBHOOK_SECRET` (without it the hook route
   answers 503 rather than defaulting to open) and
   `SUPABASE_SERVICE_ROLE_KEY`, which the capture and every staged read use.
   Both are almost certainly already set; check rather than assume, because
   a missing service key disables the whole tier *silently by design* — it
   must never take a live request down with it.
3. **Supabase → Database → Webhooks** — new webhook:
   - Table `public.enrichment_requests`, event **Insert**
   - `POST https://fin.vibelife.sg/api/hooks/enrichment-request`
   - Header `x-finvibe-hook-secret: <SUPABASE_WEBHOOK_SECRET>`
4. **DGX** — pull, then `docker compose restart api worker enrich-worker
   scheduler`. There is no auto-reload; beat changes need the scheduler
   restarted specifically.
5. **Vercel** — deploy vibefin.
6. **Warm the cache.** The captured tier starts empty and fills as the app is
   used, so the first minutes after deploy are the one window where an
   outage still hurts. Open the dashboard, the ranked book, the desk, the
   screener and a couple of stock pages, or hit the allowlisted paths with
   curl.
7. Verify, in this order:
   - **Settings → Job runs → Outage coverage.** The card reads Supabase
     alone, so unlike the job table above it, it still answers during the
     failure it describes. "Servable" is the number that matters: rows
     inside their serving window. Equivalent by hand:
     `select family, count(*), min(as_of), max(as_of) from dgx_response_snapshot group by 1;`
   - `curl -sI https://fin.vibelife.sg/api/macro/gex | grep -i 'cache-control\|x-vercel-cache'`
     — expect `public, s-maxage=300, stale-while-revalidate=86400` and, on
     the second call, `x-vercel-cache: HIT`. A `MISS` on every call means the
     edge tier is not doing anything and only Supabase is protecting you.
   - `curl -sI https://fin.vibelife.sg/api/watchlist/ | grep -i cache-control`
     — must NOT say `public`. If it does, the allowlist has been widened
     over a user-scoped route; fix that before anything else.
   - `scripts/health_check.sh` still reports pushed-snapshot coverage and
     freshness per family, plus the enrichment queue depth.

**The real test** is the one nobody runs until it happens: stop the tunnel
(or point `DGX_API_URL` at an unroutable host in a preview deployment) and
walk the app. Expected: the amber banner on every page, the dashboard and
watchlist and stock pages populated from stored copies, the desk and
screeners populated, search working over the catalog, and writes —
generate-thoughts, model runs, enrichment — failing plainly.

## Adding a family

For an endpoint DGX composes from a table it owns, and that must be staged
for names nobody has opened, the pushed path is still right:

1. A table in a new migration, shaped like the response, with `as_of` and a
   declared FK to `stock_catalog(ticker)`.
2. A `_*_rows(session, since)` builder in `supabase_sync.py`, watermarked on a
   real source timestamp — and add it to `_SNAPSHOT_FAMILIES` and
   `_SNAPSHOT_TABLES`.
3. An entry in `FAMILIES` and `ROUTES` in `src/lib/staging.ts`, with a serving
   window chosen from how fast that data actually goes wrong.
4. A line in the health check's `SNAPSHOTS` list.

For anything else — which is now most things — it is one entry in
`PATH_FAMILIES` in `src/lib/stagingPaths.ts`: a pattern, a label for the
banner, a `maxAge` chosen from how fast that data goes wrong, a
`refreshAfter`, and an `sMaxAge` for the edge. Nothing on DGX changes, and
the copy is byte-identical to the live response because it *is* the live
response.

**Only shared, public data.** The staged read runs with the service-role key,
which bypasses RLS. A fallback that returned one user's rows to another would
be far worse than the outage it was covering. A per-user endpoint needs its
own read path with the caller's session, not this one — and `NEVER_STAGE`
plus `assertShareable()` are there to make widening a pattern over one fail
loudly rather than quietly.
