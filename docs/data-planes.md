# The staging tier

What to do when the DGX box is unreachable, and what has to be deployed for it
to work. Background and the measurements behind these choices are in the
**FinVibe Data Planes** artifact.

## The shape of it

Three tiers, in order of how much of an outage they survive:

| Tier | What it covers | Where it lives |
|---|---|---|
| Supabase-native | accounts, watchlists, portfolios, MCP grants | Supabase, unaffected |
| Edge cache | shared precomputed endpoints — macro, ranked, screener, multibagger candidates, fx, signals/today | Vercel CDN, `stale-if-error=86400` |
| **Staging tier** | **per-ticker endpoints — verdict, price action, option summary, model results, Thoughts** | **Supabase snapshot tables** |

The middle and bottom rows split on temperature, not importance. The shared
endpoints are few and hot, so a CDN entry is usually resident when it is
needed. The ~400-name catalog is cold: any given ticker's verdict is almost
never in cache at the moment the box goes dark, which is why it needs a
durable copy instead.

## What is staged

| Endpoint | Supabase table | Serving window |
|---|---|---|
| `GET /api/stocks/{t}/verdict` | `stock_verdict_snapshot` | 10 days |
| `GET /api/stocks/{t}/price-action` | `stock_price_action_snapshot` | 10 days |
| `GET /api/options/{t}/summary` | `stock_option_summary_snapshot` | 3 days |
| `GET /api/models/{t}/results` | `stock_model_results_snapshot` | 14 days |
| `GET /api/stocks/{t}/thoughts` | `llm_analysis` (already mirrored) | 30 days |

Each row is shaped like the **API response**, not like the DGX schema, so the
fallback is a read and a header rather than a second serializer to keep in
step with the route.

Past its serving window a snapshot is **not served** — the caller gets the
real upstream failure. The option chain has the shortest window on purpose: a
week-old chain read as live is a wrong trade, not a stale number.

Measured 2026-08-26: the whole tier is **12.4 MB** of JSON across 1,542 rows.
Supabase Pro allows 8 GB. Capacity was never the constraint.

## How a request falls back

`src/lib/proxy.ts` → on a network error or a 5xx from DGX, and only for `GET`
on a staged path, it reads `src/lib/staging.ts` and returns the staged body
with:

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
   `supabase/018_enrichment_requests.sql`. 018 backfills any rows still
   sitting at `enrichment_status='pending'` into the new queue so no
   outstanding request is dropped.
2. **Vercel env** — set `SUPABASE_WEBHOOK_SECRET`. Without it the hook route
   answers 503 rather than defaulting to open.
3. **Supabase → Database → Webhooks** — new webhook:
   - Table `public.enrichment_requests`, event **Insert**
   - `POST https://fin.vibelife.sg/api/hooks/enrichment-request`
   - Header `x-finvibe-hook-secret: <SUPABASE_WEBHOOK_SECRET>`
4. **DGX** — pull, then `docker compose restart api worker enrich-worker
   scheduler`. There is no auto-reload; beat changes need the scheduler
   restarted specifically.
5. **Vercel** — deploy vibefin.
6. Verify: `scripts/health_check.sh` now reports snapshot coverage and
   freshness per family, plus the enrichment queue depth.

## Adding a family

1. A table in a new migration, shaped like the response, with `as_of` and a
   declared FK to `stock_catalog(ticker)`.
2. A `_*_rows(session, since)` builder in `supabase_sync.py`, watermarked on a
   real source timestamp — and add it to `_SNAPSHOT_FAMILIES` and
   `_SNAPSHOT_TABLES`.
3. An entry in `FAMILIES` and `ROUTES` in `src/lib/staging.ts`, with a serving
   window chosen from how fast that data actually goes wrong.
4. A line in the health check's `SNAPSHOTS` list.

**Only shared, public data.** The staged read runs with the service-role key,
which bypasses RLS. A fallback that returned one user's rows to another would
be far worse than the outage it was covering. A per-user endpoint needs its
own read path with the caller's session, not this one.
