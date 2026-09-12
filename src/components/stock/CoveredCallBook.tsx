"use client";

/**
 * Covered calls against shares you actually hold.
 *
 * The desk knows where resistance is; only you know what you paid. Those two
 * facts live in different places on purpose — resistance is shared, public data
 * served from DGX, and cost basis is per-user and sits in Supabase behind RLS.
 * The join happens here, in the browser, with the user's own session. It must
 * not happen on the backend: the staged read path runs with the service-role
 * key, and a shared endpoint that knew your basis would be one bad query away
 * from showing it to someone else.
 *
 * The rule the whole panel exists to enforce:
 *
 *     strike >= max(cost basis, resistance)
 *
 * Below your basis, a covered call converts an unrealised loss into a realised
 * one — you get called away at a price you never wanted to sell at, and the
 * premium rarely covers the gap. That is the one outcome a covered call must
 * never engineer, so a name whose resistance sits under your basis is shown as
 * blocked rather than quietly listed with a lower strike.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { optionsApi } from "@/lib/api";
import {
  usePortfolios,
  usePortfolioHoldings,
  usePortfolioHoldingCounts,
} from "@/lib/supabase/hooks";
import { Layers, TriangleAlert } from "lucide-react";
import Panel, { PanelPending, PanelUnavailable } from "@/components/ui/Panel";
import DataTable, { type Column } from "@/components/ui/DataTable";

interface Resistance {
  spot: number | null;
  gamma_wall: number | null;
  gamma_wall_call_oi: number | null;
  hvn: number | null;
  hvn_note?: string | null;
  max_pain: number | null;
  poc: number | null;
  resistance: number | null;
  resistance_source: string | null;
  resistance_vs_spot_pct?: number | null;
}

interface DeskRow {
  ticker: string;
  name: string | null;
  spot: number | null;
  last_price: number | null;
  tier: string;
  resistance?: Resistance;
}

const SOURCE_KEYS = ["hvn", "gamma_wall", "max_pain"] as const;
type SourceKey = (typeof SOURCE_KEYS)[number];
const isSourceKey = (s: string | null | undefined): s is SourceKey =>
  (SOURCE_KEYS as readonly string[]).includes(s ?? "");

const usd = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : `$${v.toFixed(d)}`;

export default function CoveredCallBook() {
  const t = useTranslations("deskPanels.coveredCallBook");
  const { data: portfolios } = usePortfolios();
  const { data: counts } = usePortfolioHoldingCounts();
  const [portfolioId, setPortfolioId] = useState<number | null>(null);

  // Which portfolio to open on. This used to be portfolios[0], which is the
  // default one — and every account is created with an empty default, so a
  // holder whose shares sit anywhere else was told "No holdings in this
  // portfolio" and had to find the dropdown to disagree.
  //
  // Preference order, within the list's own default-first ordering: a
  // portfolio with a lot this panel could actually write against, then one
  // holding anything at all, then the first. So the default still wins
  // whenever it qualifies, and only loses when it has nothing to offer.
  const preferredId = useMemo(() => {
    const list = portfolios ?? [];
    if (!list.length) return null;
    if (!counts) return list[0].id;
    return (
      list.find((p: { id: number }) => (counts.get(p.id)?.writable ?? 0) > 0)?.id ??
      list.find((p: { id: number }) => (counts.get(p.id)?.total ?? 0) > 0)?.id ??
      list[0].id
    );
  }, [portfolios, counts]);

  const activeId = portfolioId ?? preferredId;
  const { data: holdings, isLoading: holdingsLoading, error: holdingsError } = usePortfolioHoldings(activeId);

  // Only meaningful once an explicit choice has been made: landing here on the
  // preferred portfolio means nothing anywhere qualifies.
  const elsewhere = (portfolios ?? []).filter(
    (p: { id: number }) => p.id !== activeId && (counts?.get(p.id)?.total ?? 0) > 0,
  );

  const { data: desk } = useQuery<{ rows: DeskRow[] }>({
    queryKey: ["option-desk", "covered_call", 400],
    queryFn: () => optionsApi.desk("covered_call", 400),
    staleTime: 15 * 60_000,
  });

  const byTicker = new Map((desk?.rows ?? []).map((r) => [r.ticker.toUpperCase(), r]));

  const rows = (holdings ?? [])
    .map((h) => {
      const d = byTicker.get(h.ticker.toUpperCase());
      const res = d?.resistance;
      // Your holdings carry a live price — usePortfolioHoldings re-fetches it
      // every 60s — while the desk's spot is a field on a stored daily summary
      // that can be a session or several behind. Prefer the live one and fall
      // back to the desk only when the catalog has nothing, which is the
      // opposite of the order this used to run in.
      const livePrice = h.current_price ?? null;
      const deskSpot = res?.spot ?? d?.spot ?? null;
      const spot = livePrice ?? deskSpot;
      const spotIsLive = livePrice != null;
      const resistance = res?.resistance ?? null;
      // The rule. Whichever is higher wins; if resistance is below basis the
      // trade is blocked rather than repriced.
      const floorIsBasis = resistance != null && resistance < h.cost_basis;
      const target = resistance == null ? null : Math.max(h.cost_basis, resistance);
      return {
        ...h,
        spot,
        spotIsLive,
        deskSpot,
        res,
        resistance,
        target,
        floorIsBasis,
        contracts: Math.floor(h.shares / 100),
        unrealised: spot != null ? (spot - h.cost_basis) / h.cost_basis : null,
      };
    })
    .filter((r) => r.contracts >= 1)
    .sort((a, b) => (b.contracts || 0) - (a.contracts || 0));

  type CcRow = (typeof rows)[number];

  const blocked = rows.filter((r) => r.floorIsBasis);

  /** How long ago the catalog last wrote this price, for the Spot cell's title. */
  const spotAgeLabel = (iso: string | null | undefined): string => {
    if (!iso) return t("spot.live");
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (!Number.isFinite(mins) || mins < 0) return t("spot.live");
    if (mins < 60) return t("spot.minutesAgo", { mins });
    const hours = Math.round(mins / 60);
    if (hours < 48) return t("spot.hoursAgo", { hours });
    return t("spot.daysAgo", { days: Math.round(hours / 24) });
  };

  const columns: Column<CcRow>[] = [
    {
      key: "ticker",
      header: t("col.ticker"),
      sortable: true,
      sortValue: (r) => r.ticker,
      cell: (r) => (
        <span>
          <span className="font-mono font-bold">{r.ticker}</span>
          {r.unrealised != null ? (
            <span
              className={`ml-2 text-[11px] ${r.unrealised >= 0 ? "text-signal-long" : "text-signal-short"}`}
            >
              {r.unrealised >= 0 ? "+" : ""}
              {(r.unrealised * 100).toFixed(1)}%
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "shares",
      header: t("col.shares"),
      sortable: true,
      align: "right",
      hideBelow: "md",
      sortValue: (r) => r.shares,
      cell: (r) => <span className="nums">{r.shares}</span>,
    },
    {
      key: "basis",
      header: t("col.basis"),
      ariaLabel: t("aria.basis"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.cost_basis,
      cell: (r) => <span className="nums">{usd(r.cost_basis)}</span>,
    },
    {
      key: "spot",
      header: t("col.spot"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.spot,
      cell: (r) =>
        r.spotIsLive ? (
          <span className="nums text-muted-foreground" title={spotAgeLabel(r.last_price_updated_at)}>
            {usd(r.spot)}
          </span>
        ) : (
          <span className="nums text-signal-caution" title={t("spot.storedTitle")}>
            {usd(r.spot)}
            <span className="ml-1 text-[10px]">{t("spot.stored")}</span>
          </span>
        ),
    },
    {
      key: "resistance",
      header: t("col.resistance"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.resistance,
      cell: (r) =>
        r.resistance == null ? (
          <span className="text-muted-foreground" title={r.res?.hvn_note ?? t("noLevel")}>
            —
          </span>
        ) : (
          <span className="nums">
            {usd(r.resistance)}
            <span className="ml-1 text-[10px] text-muted-foreground">
              {isSourceKey(r.res?.resistance_source) ? t(`source.${r.res!.resistance_source as SourceKey}`) : ""}
            </span>
          </span>
        ),
    },
    {
      key: "target",
      header: t("col.minStrike"),
      ariaLabel: t("aria.minStrike"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.target,
      cell: (r) =>
        r.target == null ? (
          <span className="nums font-semibold">—</span>
        ) : r.floorIsBasis ? (
          <span className="nums font-semibold text-signal-caution" title={t("floorIsBasis")}>
            {usd(r.target)}
          </span>
        ) : (
          <span className="nums font-semibold">{usd(r.target)}</span>
        ),
    },
    {
      key: "contracts",
      header: t("col.contracts"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.contracts,
      cell: (r) => <span className="nums text-muted-foreground">{r.contracts}</span>,
    },
  ];

  const label = (
    <>
      <Layers className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
      {t("label")}
    </>
  );

  const aside =
    portfolios && portfolios.length > 1 ? (
      <label className="flex items-center gap-2">
        <span className="stat-label">{t("portfolio")}</span>
        <select
          value={activeId ?? ""}
          onChange={(e) => setPortfolioId(Number(e.target.value))}
          className="rounded-control border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {portfolios.map((p: { id: number; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
    ) : undefined;

  if (holdingsError) {
    return <PanelUnavailable label={label} aside={aside} reason={t("unavailable")} />;
  }
  if (holdingsLoading) {
    return <PanelPending label={label} text={t("loading")} />;
  }

  return (
    <Panel
      label={label}
      qualifier={rows.length > 0 ? t("qualifier", { count: rows.length }) : undefined}
      aside={aside}
      reading={rows.length > 0 ? t("reading") : undefined}
    >
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">{t("lead")}</p>

      {!holdings?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("noHoldings")}
          {elsewhere.length > 0 ? (
            <>
              {" "}
              {t("holdingsElsewhere", {
                names: elsewhere.map((p: { name: string }) => p.name).join(", "),
              })}
            </>
          ) : null}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noLots")}</p>
      ) : (
        <>
          <DataTable<CcRow>
            caption={t("tableCaption")}
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.id)}
            rowHref={(r) => `/stock/${r.ticker}`}
          />

          {blocked.length > 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-control border border-signal-caution/40 bg-signal-caution-bg p-2.5 text-xs text-signal-caution">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t.rich("blocked", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                  tickers: blocked.map((b) => b.ticker).join(", "),
                })}
              </span>
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
