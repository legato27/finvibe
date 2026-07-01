"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Sparkles, ShieldAlert, RefreshCw } from "lucide-react";
import { scannerApi, stocksApi } from "@/lib/api";
import { useWatchlistGroups } from "@/lib/supabase/hooks";
import LivePrice from "@/components/ui/LivePrice";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { useSwingMap, SwingCell } from "@/components/shared/SwingLevels";
import { InfoTip } from "@/components/shared/InfoTip";
import { ScreenerTabs } from "@/components/shared/ScreenerTabs";
import { LastUpdated } from "@/components/common/LastUpdated";
import { WatchlistStar } from "@/components/shared/WatchlistStar";
import { WatchlistPicklist, watchlistTickerSet, ALL_WATCHLISTS } from "@/components/shared/WatchlistPicklist";
import { type FilterDef } from "@/components/shared/ColumnFilters";

// Scanner emits a lighter PAM read than the watchlist PamSummary.
interface PamRead {
  structure?: string | null;
  clarity?: string | null;
  timeframe?: string | null;
  daily_fsb_bull?: boolean;
  fsb_vol_confirmed?: boolean;
  rsi?: number | null;
  near_pivot?: boolean;
}
const PAM_STYLE: Record<string, string> = {
  UC: "text-success",
  DC: "text-danger",
  "UR zone": "text-warning",
  "DR zone": "text-warning",
  Ranging: "text-muted-foreground",
};

// ── Types ────────────────────────────────────────────────────────
interface Fundamentals {
  rev_growth_yoy?: number | null;
  eps_growth_yoy?: number | null;
  accelerating?: boolean;
  margin_trend?: string | null;
}
interface RedFlags {
  verdict?: "clean" | "caution" | "avoid";
  redflags?: string[];
  note?: string;
}
interface Candidate {
  rank: number;
  ticker: string;
  name?: string;
  sector?: string | null;
  theme_cluster?: string | null;
  track: "A" | "B";
  price: number;
  composite: number;
  rs_rating: number;
  ret_1m?: number | null;
  ret_3m?: number | null;
  ret_6m?: number | null;
  ret_12m?: number | null;
  pct_from_52w_high?: number | null;
  market_cap_band?: string | null;
  float_m?: number | null;
  short_interest_pct?: number | null;
  trend_template_passed?: number;
  pivot?: number | null;
  dist_to_pivot_pct?: number | null;
  breakout_state?: string | null;
  breakout_volume_confirmed?: boolean;
  fundamentals?: Fundamentals | null;
  catalyst?: { score: number; source: string } | null;
  pam?: PamRead | null;
  redflags?: RedFlags | null;
}
interface Regime {
  regime: "risk_on" | "neutral" | "risk_off";
  score: number;
  vix?: { level?: number | null; trend?: string };
  breadth_pct_above_200dma?: number | null;
  spy_trend?: string;
  leading_sectors?: string[];
  scoring_profile?: string;
}
interface ScanResult {
  as_of: string;
  matrix_end?: string;
  regime: Regime | null;
  universe_size: number;
  pass1_survivors: number;
  scored: number;
  candidates: Candidate[];
  method: string;
}

const REGIME_STYLE: Record<string, string> = {
  risk_on: "text-success border-success/40 bg-success/10",
  neutral: "text-warning border-warning/40 bg-warning/10",
  risk_off: "text-danger border-danger/40 bg-danger/10",
};
const VERDICT_STYLE: Record<string, string> = {
  clean: "text-success",
  caution: "text-warning",
  avoid: "text-danger",
};
const TIPS = {
  track:
    "Trk: A = confirmed leader (Minervini Trend Template + RS). B = early-stage base/VCP with a strong RS-line — the earlier multibagger entry.",
  score:
    "Composite 0–100: RS, gate completeness, fundamental acceleration, institutional footprint, PAM structure, catalyst, squeeze fuel, cap band & sector leadership. Regime-flexed.",
  rs: "IBD-style 1–99 relative-strength rank of blended 12/6/3/1-month return across the whole US market.",
  ret12m: "12-month price return.",
  frm52h: "% below the 52-week high — how extended (Track A) or based (Track B) the name is.",
  fund: "YoY revenue / EPS growth from Polygon financials (yfinance fallback). ▲ = accelerating quarter-over-quarter (CANSLIM C+A).",
  theme: "Sector cohort — names in the same sector cluster (e.g. AI, energy) surface together.",
  redflag: "Skeptical short-seller LLM contra-check: dilution, going-concern, pump pattern. Demotes false positives.",
  pam: "PAM structure on WEEKLY bars (the base timeframe); ⚡ = daily bullish Force Strike Bar (confirmation candle).",
  status:
    "Breakout state vs the 60-day pivot: Basing = pre-breakout watch; Breakout ✓ = crossed the pivot in the last 3 sessions on ≥1.5× volume (the entry); Breakout? = crossed without volume; Extended = >8% past the pivot (chase).",
};

const pct = (x?: number | null) =>
  x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;
const pctColor = (x?: number | null) =>
  x == null ? "text-muted-foreground" : x >= 0 ? "text-success" : "text-danger";

export default function MultibaggerPage() {
  const [track, setTrack] = useState<"all" | "A" | "B">("all");
  const [tab, setTab] = useState<"candidates" | "performance">("candidates");
  const [watchlist, setWatchlist] = useState<string>(ALL_WATCHLISTS);
  const { data: watchlistGroups } = useWatchlistGroups();

  const { data, isLoading, error, refetch, isFetching } = useQuery<ScanResult>({
    queryKey: ["multibagger-candidates", track],
    queryFn: () => scannerApi.multibaggerCandidates(track),
    staleTime: 5 * 60 * 1000,
  });

  // Live price overlay (60s) — scan prices are end-of-day; without this the
  // table reads stale all session (chunked: backend caps /prices/batch at 100).
  const candTickers = (data?.candidates ?? []).map((c) => c.ticker);
  const { data: livePrices } = useQuery<Array<{ ticker: string; price: number | null }>>({
    queryKey: ["mb-live-prices", candTickers.length],
    queryFn: () => stocksApi.refreshPrices(candTickers),
    enabled: candTickers.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const livePriceMap = new Map((livePrices ?? []).map((x) => [x.ticker, x.price]));

  // Nearest weekly swing low/high (support / resistance) per candidate.
  const swingMap = useSwingMap(candTickers);

  const { data: perf } = useQuery({
    queryKey: ["multibagger-performance"],
    queryFn: () => scannerApi.multibaggerPerformance(),
    enabled: tab === "performance",
    staleTime: 10 * 60 * 1000,
  });

  const regime = data?.regime;

  // Watchlist scope → type-aware column filters (rank order preserved).
  const wlSet = watchlistTickerSet(watchlistGroups, watchlist);
  const wlRows = (data?.candidates ?? []).filter(
    (c) => !wlSet || wlSet.has(c.ticker.toUpperCase()),
  );
  const filterDefs: FilterDef<Candidate>[] = [
    { key: "ticker", label: "Ticker", kind: "text", value: (c) => `${c.ticker} ${c.name ?? ""}` },
    { key: "track", label: "Track", kind: "select", value: (c) => c.track },
    { key: "sector", label: "Sector", kind: "select", value: (c) => c.sector ?? "" },
    { key: "theme", label: "Theme", kind: "select", value: (c) => c.theme_cluster ?? "" },
    { key: "breakout", label: "Status", kind: "select", value: (c) => c.breakout_state ?? "" },
    { key: "flags", label: "Flags", kind: "select", value: (c) => c.redflags?.verdict ?? "" },
    { key: "score", label: "Score", kind: "number", value: (c) => c.composite ?? null },
    { key: "rs", label: "RS", kind: "number", value: (c) => c.rs_rating ?? null },
    { key: "ret12m", label: "12m %", kind: "number", value: (c) => c.ret_12m ?? null },
    { key: "frm52h", label: "% from 52wH", kind: "number", value: (c) => c.pct_from_52w_high ?? null },
  ];
  const columns: Column<Candidate>[] = [
    {
      key: "ticker",
      header: "Ticker",
      cell: (c) => (
        <span className="font-mono whitespace-nowrap">
          <span className="text-muted-foreground mr-1.5">{c.rank}</span>
          <span className="font-semibold text-primary">{c.ticker}</span>
          {c.market_cap_band && (
            <span className="text-[9px] text-muted-foreground uppercase ml-1">{c.market_cap_band}</span>
          )}
        </span>
      ),
    },
    {
      key: "watch",
      header: <span className="sr-only">Watchlist</span>,
      ariaLabel: "Watchlist",
      cell: (c) => <WatchlistStar ticker={c.ticker} />,
    },
    {
      key: "track",
      header: "Track",
      ariaLabel: "Track (A leaders / B early)",
      sortable: true,
      sortValue: (c) => c.track,
      cell: (c) => (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
          c.track === "A" ? "bg-primary/15 text-primary" : "bg-signal-conflict/15 text-signal-conflict"
        }`}>{c.track}</span>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortable: true,
      sortValue: (c) => livePriceMap.get(c.ticker) ?? c.price ?? null,
      cell: (c) => (
        <LivePrice
          price={livePriceMap.get(c.ticker) ?? c.price}
          currency="$"
          live={livePriceMap.get(c.ticker) != null}
          className="text-xs"
        />
      ),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      sortable: true,
      sortValue: (c) => c.composite ?? null,
      cell: (c) => <span className="font-mono font-semibold text-foreground">{c.composite?.toFixed(1)}</span>,
    },
    {
      key: "rs",
      header: "Rel. str.",
      ariaLabel: "Relative strength",
      align: "right",
      sortable: true,
      sortValue: (c) => c.rs_rating ?? null,
      cell: (c) => <span className="font-mono">{c.rs_rating}</span>,
    },
    {
      key: "swing",
      header: "Swing L / H",
      ariaLabel: "Swing low / high",
      align: "right",
      cell: (c) => <SwingCell swing={swingMap.get(c.ticker)} />,
    },
    {
      key: "status",
      header: "Status",
      ariaLabel: "Breakout status",
      cell: (c) =>
        c.breakout_state === "breakout_confirmed" ? (
          <span className="inline-flex items-center gap-0.5 rounded border border-signal-long/40 bg-signal-long-bg px-1.5 py-0.5 text-[10px] font-semibold text-signal-long" title={`Pivot $${c.pivot?.toFixed(2)} crossed on volume`}>Breakout ✓</span>
        ) : c.breakout_state === "breakout_unconfirmed" ? (
          <span className="inline-flex items-center rounded border border-signal-caution/40 bg-signal-caution-bg px-1.5 py-0.5 text-[10px] font-semibold text-signal-caution" title={`Pivot $${c.pivot?.toFixed(2)} crossed, volume weak`}>Breakout?</span>
        ) : c.breakout_state === "basing" ? (
          <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={`Watching: ${c.dist_to_pivot_pct != null ? c.dist_to_pivot_pct + "% to" : "below"} pivot $${c.pivot?.toFixed(2)}`}>Basing {c.dist_to_pivot_pct != null ? `${c.dist_to_pivot_pct}%` : ""}</span>
        ) : c.breakout_state === "extended" ? (
          <span className="inline-flex items-center rounded border border-signal-short/40 bg-signal-short-bg px-1.5 py-0.5 text-[10px] text-signal-short">Extended</span>
        ) : (
          <span className="text-muted-foreground text-[10px]">{c.breakout_state === "above_pivot" ? "Above pivot" : "—"}</span>
        ),
    },
    {
      key: "pam",
      header: "Trend (PAM)",
      ariaLabel: "Trend (Price Action)",
      cell: (c) =>
        c.pam?.structure ? (
          <span
            title={`Weekly ${c.pam.structure} · ${c.pam.clarity ?? ""} clarity${c.pam.rsi != null ? ` · RSI ${c.pam.rsi}` : ""}${c.pam.near_pivot ? " · near pivot" : ""}${c.pam.daily_fsb_bull ? " · daily FSB ⚡" : ""}`}
            className={`text-[10px] font-medium ${PAM_STYLE[c.pam.structure] ?? "text-muted-foreground"}`}
          >
            {c.pam.structure}
            {c.pam.near_pivot && "*"}
            {c.pam.daily_fsb_bull && <span title="Daily bullish Force Strike Bar" aria-label="daily bullish force strike bar"> ⚡</span>}
          </span>
        ) : (
          <span className="text-muted-foreground text-[10px]">—</span>
        ),
    },
    {
      key: "ret12m",
      header: "12m %",
      align: "right",
      optional: true,
      sortable: true,
      sortValue: (c) => c.ret_12m ?? null,
      cell: (c) => <span className={`font-mono ${pctColor(c.ret_12m)}`}>{pct(c.ret_12m)}</span>,
    },
    {
      key: "frm52h",
      header: "% from 52w high",
      align: "right",
      optional: true,
      sortable: true,
      sortValue: (c) => c.pct_from_52w_high ?? null,
      cell: (c) => <span className="font-mono text-muted-foreground">{pct(c.pct_from_52w_high)}</span>,
    },
    {
      key: "fund",
      header: "Fund. accel.",
      ariaLabel: "Fundamental acceleration",
      align: "right",
      optional: true,
      cell: (c) =>
        c.fundamentals?.rev_growth_yoy != null ? (
          <span className={pctColor(c.fundamentals.rev_growth_yoy)}>
            {pct(c.fundamentals.rev_growth_yoy)}
            {c.fundamentals.accelerating && <TrendingUp className="inline w-3 h-3 ml-0.5" />}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "theme",
      header: "Theme",
      optional: true,
      cell: (c) => <span className="text-muted-foreground">{c.theme_cluster ?? "—"}</span>,
    },
    {
      key: "flags",
      header: "Risk flags",
      ariaLabel: "Risk flags",
      optional: true,
      cell: (c) =>
        c.redflags?.verdict ? (
          <span title={c.redflags.note || (c.redflags.redflags ?? []).join("; ")} className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${VERDICT_STYLE[c.redflags.verdict] ?? ""}`}>
            {c.redflags.verdict === "avoid" && <ShieldAlert className="w-3 h-3" />}
            {c.redflags.verdict}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <ScreenerTabs />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Multibagger Scanner
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            A scan of the whole US market for potential big winners.{" "}
            <span className="text-foreground/80">Two tracks:</span> <strong className="text-foreground/80">Track A</strong> =
            established leaders already trending up; <strong className="text-foreground/80">Track B</strong> = early-stage
            names breaking out of a base. Higher Score = stronger candidate; the banner below shows whether today&rsquo;s
            market favours A or B.
          </p>
          <LastUpdated at={data?.as_of} className="mt-1 inline-block" />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* ── Regime banner ── */}
      {regime && (
        <div className={`rounded-lg border px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${REGIME_STYLE[regime.regime] ?? ""}`}>
          <span className="font-semibold uppercase tracking-wide">
            {regime.regime.replace("_", "-")}
          </span>
          <span className="opacity-80">score {regime.score}</span>
          {regime.vix?.level != null && <span className="opacity-80">VIX {regime.vix.level} ({regime.vix.trend})</span>}
          {regime.breadth_pct_above_200dma != null && (
            <span className="opacity-80">breadth {regime.breadth_pct_above_200dma}% &gt;200d</span>
          )}
          {regime.spy_trend && <span className="opacity-80">SPY {regime.spy_trend}</span>}
          {regime.leading_sectors && regime.leading_sectors.length > 0 && (
            <span className="opacity-80">leaders: {regime.leading_sectors.join(", ")}</span>
          )}
          <span className="ml-auto opacity-70">
            profile: {regime.scoring_profile} · favouring Track {regime.regime === "risk_off" ? "B" : "A"}
          </span>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
        {(["candidates", "performance"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              tab === t ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "candidates" && (
        <>
          {/* track toggle (drives the scan query) + watchlist scope */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border/30 w-fit">
              {([["all", "All"], ["A", "Track A · Leaders"], ["B", "Track B · Early"]] as const).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setTrack(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    track === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <WatchlistPicklist groups={watchlistGroups} value={watchlist} onChange={setWatchlist} />
          </div>

          {isLoading && <div className="card p-6 text-sm text-muted-foreground">Loading candidates…</div>}
          {error && <div className="card p-6 text-sm text-danger">Failed to load candidates.</div>}

          {data && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{data.universe_size?.toLocaleString() ?? 0} scanned</span>
                <span>· {data.pass1_survivors} survivors</span>
                <span>· {wlRows.length} candidates</span>
                {data.matrix_end && <span>· as of {data.matrix_end}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground bg-muted/30 border border-border/30 rounded-lg px-3 py-2">
                <span className="text-foreground/70 font-medium">What the columns mean:</span>
                <InfoTip label="Track" tip={TIPS.track} size={11} />
                <InfoTip label="Score" tip={TIPS.score} size={11} />
                <InfoTip label="Rel. str." tip={TIPS.rs} size={11} />
                <InfoTip label="12m %" tip={TIPS.ret12m} size={11} />
                <InfoTip label="% from 52w high" tip={TIPS.frm52h} size={11} />
                <InfoTip label="Fund. accel." tip={TIPS.fund} size={11} />
                <InfoTip label="Theme" tip={TIPS.theme} size={11} />
                <InfoTip label="Trend (PAM)" tip={TIPS.pam} size={11} />
                <InfoTip label="Risk flags" tip={TIPS.redflag} size={11} />
              </div>

              <DataTable
                caption="Multibagger candidates — two-track full-market scan"
                columns={columns}
                rows={wlRows}
                rowKey={(c) => c.ticker}
                rowHref={(c) => `/stock/${c.ticker}`}
                filters={filterDefs}
                emptyText="No candidates match. The scanner needs a paid Polygon plan with polygon_universe_enabled."
              />
              <p className="text-[10px] text-muted-foreground">{data.method}</p>
            </>
          )}
        </>
      )}

      {tab === "performance" && (
        <div className="card p-4 text-xs space-y-3">
          {!perf && <div className="text-muted-foreground">Loading scorecard…</div>}
          {perf && perf.n_matured === 0 && (
            <div className="text-muted-foreground">
              {perf.note ?? "No matured candidates yet — forward returns fill in as history accrues."}
            </div>
          )}
          {perf && perf.n_matured > 0 && (
            <>
              <div className="text-muted-foreground">
                {perf.n_matured} matured of {perf.n_candidates} candidates · last {perf.lookback_days}d
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                    <th className="text-left p-2">Horizon</th>
                    <th className="text-right p-2">n</th>
                    <th className="text-right p-2">Hit&gt;0</th>
                    <th className="text-right p-2">Hit 2x</th>
                    <th className="text-right p-2">Median</th>
                    <th className="text-right p-2">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {(["1m", "3m", "6m", "12m"] as const).map((h) => {
                    const a = perf.by_horizon?.[h];
                    if (!a) return null;
                    return (
                      <tr key={h} className="border-b border-border/10">
                        <td className="p-2 font-medium">{h}</td>
                        <td className="p-2 text-right font-mono">{a.n}</td>
                        <td className="p-2 text-right font-mono">{a.hit_rate_pos_pct}%</td>
                        <td className="p-2 text-right font-mono text-primary">{a.hit_rate_2x_pct}%</td>
                        <td className={`p-2 text-right font-mono ${pctColor(a.median_ret_pct)}`}>{a.median_ret_pct}%</td>
                        <td className="p-2 text-right font-mono text-success">{a.p90_ret_pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {perf.factor_ic_3m && (
                <div className="text-muted-foreground">
                  Factor IC (3m): composite {perf.factor_ic_3m.composite ?? "—"} · RS {perf.factor_ic_3m.rs_rating ?? "—"}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Survivorship-skewed: only names active when scanned are tracked.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
