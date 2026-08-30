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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { optionsApi } from "@/lib/api";
import { usePortfolios, usePortfolioHoldings } from "@/lib/supabase/hooks";
import { Layers, TriangleAlert } from "lucide-react";

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

const SOURCE_LABEL: Record<string, string> = {
  hvn: "volume shelf",
  gamma_wall: "call OI wall",
  max_pain: "max pain",
};

const usd = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : `$${v.toFixed(d)}`;

export default function CoveredCallBook() {
  const { data: portfolios } = usePortfolios();
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const activeId = portfolioId ?? portfolios?.[0]?.id ?? null;
  const { data: holdings } = usePortfolioHoldings(activeId);

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
      const spot = res?.spot ?? d?.spot ?? h.current_price ?? null;
      const resistance = res?.resistance ?? null;
      // The rule. Whichever is higher wins; if resistance is below basis the
      // trade is blocked rather than repriced.
      const floorIsBasis = resistance != null && resistance < h.cost_basis;
      const target = resistance == null ? null : Math.max(h.cost_basis, resistance);
      return {
        ...h,
        spot,
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

  const blocked = rows.filter((r) => r.floorIsBasis);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            Covered calls on what you hold
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Your cost basis stays in your browser — it is read from your portfolio with your own
            session and joined to the desk&apos;s resistance levels here, never sent upstream. Only
            lots of 100+ shares can be written against.
          </p>
        </div>
        {portfolios && portfolios.length > 1 ? (
          <label className="flex flex-col text-[11px] uppercase tracking-wide text-muted-foreground">
            Portfolio
            <select
              value={activeId ?? ""}
              onChange={(e) => setPortfolioId(Number(e.target.value))}
              className="mt-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              {portfolios.map((p: { id: number; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {!holdings?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No holdings in this portfolio. Covered calls need shares you already own.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No position reaches 100 shares, which is the minimum for one contract.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Covered call candidates from your holdings</caption>
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">Ticker</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Shares</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Basis</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Spot</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Resistance</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Min strike</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Contracts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-mono font-bold">{r.ticker}</span>
                      {r.unrealised != null ? (
                        <span
                          className={`ml-2 text-[11px] ${
                            r.unrealised >= 0 ? "text-signal-long" : "text-signal-short"
                          }`}
                        >
                          {r.unrealised >= 0 ? "+" : ""}
                          {(r.unrealised * 100).toFixed(1)}%
                        </span>
                      ) : null}
                    </td>
                    <td className="nums py-2 pr-3 text-right">{r.shares}</td>
                    <td className="nums py-2 pr-3 text-right">{usd(r.cost_basis)}</td>
                    <td className="nums py-2 pr-3 text-right text-muted-foreground">{usd(r.spot)}</td>
                    <td className="nums py-2 pr-3 text-right">
                      {r.resistance == null ? (
                        <span
                          className="text-muted-foreground"
                          title={r.res?.hvn_note ?? "no level above spot in the stored data"}
                        >
                          —
                        </span>
                      ) : (
                        <>
                          {usd(r.resistance)}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {SOURCE_LABEL[r.res?.resistance_source ?? ""] ?? ""}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="nums py-2 pr-3 text-right font-semibold">
                      {r.target == null ? (
                        "—"
                      ) : r.floorIsBasis ? (
                        <span
                          className="text-signal-caution"
                          title="Resistance sits below your cost basis — writing at resistance would lock in a loss. Your basis is the floor."
                        >
                          {usd(r.target)}
                        </span>
                      ) : (
                        usd(r.target)
                      )}
                    </td>
                    <td className="nums py-2 pr-3 text-right text-muted-foreground">
                      {r.contracts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {blocked.length > 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded border border-signal-caution/40 bg-signal-caution-bg p-2.5 text-xs text-signal-caution">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{blocked.map((b) => b.ticker).join(", ")}</strong>: resistance sits below
                your cost basis. Writing at the resistance level would cap you out at a loss, so the
                basis becomes the floor — and a strike that far above spot may pay almost nothing.
                Holding the shares uncovered is often the better trade here.
              </span>
            </p>
          ) : null}

          <p className="mt-2 text-[11px] text-muted-foreground">
            Resistance is the lowest of three independent reads — the nearest volume shelf, the
            heaviest call open-interest strike above spot, and max pain. A dash means the price has
            cleared all of them, which argues for a further strike rather than a closer one.
          </p>
        </>
      )}
    </section>
  );
}
