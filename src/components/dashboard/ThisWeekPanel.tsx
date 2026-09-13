"use client";

/**
 * ThisWeekPanel — the week ahead, for the Today aside.
 *
 * Scheduled US events (Fed, CPI, jobs, PCE, opex and witching, holidays)
 * from the repo's calendar, joined with earnings and ex-dividend dates for
 * the reader's watchlist and held names from the per-ticker events route.
 * One sentence first — "This week: Fed decision Wednesday, quad witching
 * Friday. Two of your names report." — then the rows by day, then the next
 * three weeks under a Disclosure. Never returns null: a quiet week says so,
 * a signed-out reader gets the public calendar and a line about signing in,
 * and a window past the calendar's horizon is named as such.
 *
 * Times are stored in US Eastern and shown in the viewer's zone once the
 * component has mounted; before that (and on the server) they show in ET,
 * so the markup hydrates without a zone mismatch.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { macroApi } from "@/lib/api";
import Panel from "@/components/ui/Panel";
import Disclosure from "@/components/ui/Disclosure";
import Chip from "@/components/ui/Chip";
import { stocksApi } from "@/lib/api";
import { useAllHoldings, useMyWatchlistTickers, useUser } from "@/lib/supabase/hooks";
import {
  addDays,
  eventInstant,
  horizon,
  mergeEvents,
  scheduledEvents,
  weekOf,
  type CalEvent,
  type CalKind,
} from "@/lib/calendar/us";

/** Names checked for earnings and ex-div dates; each is one cached request a day. */
const MAX_NAMES = 60;
const WEEKS_AHEAD = 4;

type InflationRow = {
  month: string;
  cpi_yoy: number | null; cpi_core_yoy: number | null; cpi_mom: number | null; cpi_core_mom: number | null;
  pce_yoy: number | null; pce_core_yoy: number | null; pce_mom: number | null; pce_core_mom: number | null;
};
type InflationResponse = {
  rows: InflationRow[];
  latest: { cpi: InflationRow | null; pce: InflationRow | null };
  expectations: { date: string | null; market_5_year: number | null; market_10_year: number | null; model_1_year: number | null } | null;
  target: number;
};

type EventsResponse = {
  earnings_date?: string | null;
  earnings_date_end?: string | null;
  ex_dividend_date?: string | null;
};

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ThisWeekPanel({ todayIso }: { todayIso?: string }) {
  const t = useTranslations("dashboard.week");
  const locale = useLocale();
  const { data: user } = useUser();
  const { data: watch } = useMyWatchlistTickers();
  const { data: holdings } = useAllHoldings(!!user);

  // Viewer zone, known only after mount.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  const today = todayIso ?? localIso(new Date());
  const week = weekOf(today);
  const to = addDays(week.from, WEEKS_AHEAD * 7 - 1);
  const scheduled = useMemo(() => scheduledEvents(week.from, to), [week.from, to]);

  const held = useMemo(() => new Set((holdings ?? []).map((h) => h.ticker.toUpperCase())), [holdings]);
  const names = useMemo(() => {
    if (!user) return [];
    const all = new Set<string>([...held, ...(watch ?? [])]);
    return [...all].sort().slice(0, MAX_NAMES);
  }, [user, held, watch]);
  const namesTotal = user ? new Set<string>([...held, ...(watch ?? [])]).size : 0;

  const eventQueries = useQueries({
    queries: names.map((tk) => ({
      queryKey: ["stock_events", tk],
      queryFn: () => stocksApi.events(tk) as Promise<EventsResponse>,
      staleTime: 24 * 60 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 0,
    })),
  });
  const eventData = eventQueries.map((q) => q.data);

  const named = useMemo(() => {
    const out: CalEvent[] = [];
    names.forEach((tk, i) => {
      const d = eventData[i];
      if (!d) return;
      const e = d.earnings_date?.slice(0, 10);
      if (e && e >= week.from && e <= to) out.push({ date: e, kind: "earnings", tickers: [tk], weight: held.has(tk) ? "high" : "medium" });
      const x = d.ex_dividend_date?.slice(0, 10);
      if (x && x >= week.from && x <= to) out.push({ date: x, kind: "ex_div", tickers: [tk], weight: "low" });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, held, week.from, to, ...eventData]);

  // Inflation prints from the box (Polygon's economy feed), attached to the
  // CPI and PCE rows: the month's own figure once released, else the latest.
  const { data: inflation } = useQuery<InflationResponse>({
    queryKey: ["macro_inflation"],
    queryFn: macroApi.inflation,
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });
  const monthName = useMemo(() => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }), []);
  const pctS = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v.toFixed(d)}%`);
  const signed = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`);
  const annotate = (e: CalEvent): CalEvent => {
    if (!inflation || (e.kind !== "cpi" && e.kind !== "pce")) return e;
    const rows = inflation.rows ?? [];
    const key = e.kind === "cpi" ? "cpi_yoy" : "pce_yoy";
    const coreKey = e.kind === "cpi" ? "cpi_core_yoy" : "pce_core_yoy";
    // The reference month is the one before the release; a December print
    // released in January belongs to the prior year.
    const releaseYear = Number(e.date.slice(0, 4));
    const refYear = e.detail === "December" && e.date.slice(5, 7) === "01" ? releaseYear - 1 : releaseYear;
    const idx = rows.findIndex(
      (r) => r[key] != null && r.month.slice(0, 4) === String(refYear) && monthName.format(new Date(`${r.month}T00:00:00Z`)) === e.detail,
    );
    if (idx >= 0) {
      const r = rows[idx];
      const prev = [...rows.slice(0, idx)].reverse().find((x) => x[key] != null);
      const delta = prev && r[key] != null && prev[key] != null ? r[key]! - prev[key]! : null;
      return { ...e, note: t("printThis", { yoy: pctS(r[key]), delta: delta == null ? "—" : signed(delta), core: pctS(r[coreKey]) }) };
    }
    const latest = e.kind === "cpi" ? inflation.latest?.cpi : inflation.latest?.pce;
    if (!latest) return e;
    return { ...e, note: t("printLast", { month: monthName.format(new Date(`${latest.month}T00:00:00Z`)), yoy: pctS(latest[key]), core: pctS(latest[coreKey]) }) };
  };

  const merged = useMemo(() => mergeEvents(scheduled, named).map(annotate), [scheduled, named, inflation]); // eslint-disable-line react-hooks/exhaustive-deps
  const thisWeek = merged.filter((e) => e.date <= week.to);
  const later = merged.filter((e) => e.date > week.to);

  const fmtDay = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  const fmtWeekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }), [locale]);
  const fmtTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz ?? "America/New_York" }),
    [locale, tz],
  );
  const dayOf = (iso: string) => fmtDay.format(new Date(`${iso}T00:00:00Z`));
  const weekdayOf = (iso: string) => fmtWeekday.format(new Date(`${iso}T00:00:00Z`));
  const timeOf = (e: CalEvent) => {
    const at = eventInstant(e);
    return at ? fmtTime.format(at) : null;
  };
  const kindLabel = (k: CalKind) => t(`kind.${k}` as never);

  // The sentence. High-weight scheduled events by weekday, then the names.
  const highs = thisWeek.filter((e) => e.weight === "high" && e.kind !== "earnings").slice(0, 3);
  const reporting = thisWeek.filter((e) => e.kind === "earnings").reduce((n, e) => n + (e.tickers?.length ?? 0), 0);
  const heldReporting = thisWeek
    .filter((e) => e.kind === "earnings")
    .reduce((n, e) => n + (e.tickers ?? []).filter((tk) => held.has(tk)).length, 0);
  const sentences: string[] = [];
  if (highs.length) sentences.push(t("readingLead", { items: joinList(highs.map((e) => `${kindLabel(e.kind)} ${weekdayOf(e.date)}`)) }));
  else if (!thisWeek.length) sentences.push(t("readingQuiet"));
  if (reporting) sentences.push(t("readingNames", { count: reporting }));
  if (heldReporting) sentences.push(t("readingHeld", { count: heldReporting }));
  if (!user) sentences.push(t("signedOut"));
  else if (namesTotal > MAX_NAMES) sentences.push(t("namesCapped", { count: MAX_NAMES, total: namesTotal }));
  if (to > horizon()) sentences.push(t("readingHorizon", { date: dayOf(horizon()) }));
  if (inflation?.latest?.cpi) sentences.push(t("readingInflation", { yoy: pctS(inflation.latest.cpi.cpi_yoy), core: pctS(inflation.latest.cpi.cpi_core_yoy), target: inflation.target ?? 2 }));

  // Four columns fit the 360px aside; the rest sit behind the table's
  // optional-columns toggle.
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
  const inflationColumns: Column<InflationRow>[] = [
    { key: "month", header: t("col.month"), cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{fmtMonth.format(new Date(`${r.month}T00:00:00Z`))}</span> },
    { key: "cpi", header: t("col.cpi"), align: "right", cell: (r) => <span className="nums font-mono">{pctS(r.cpi_yoy)}</span> },
    { key: "core", header: t("col.core"), align: "right", cell: (r) => <span className="nums font-mono">{pctS(r.cpi_core_yoy)}</span> },
    { key: "pce", header: t("col.pce"), align: "right", cell: (r) => <span className="nums font-mono">{pctS(r.pce_yoy)}</span> },
    { key: "mom", header: t("col.mom"), align: "right", optional: true, cell: (r) => <span className="nums font-mono">{signed(r.cpi_mom, 2)}</span> },
    { key: "pceCore", header: t("col.pceCore"), align: "right", optional: true, cell: (r) => <span className="nums font-mono">{pctS(r.pce_core_yoy)}</span> },
  ];
  const inflationRows = [...(inflation?.rows ?? [])].reverse().slice(0, 12);
  const ex = inflation?.expectations;

  const qualifier = `${dayOf(week.from)} – ${dayOf(week.to)}`;
  const aside = (
    <span className="font-mono text-[11px] text-dim">{t("timesIn", { tz: tz ?? "ET" })}</span>
  );

  return (
    <>
      <Panel label={t("label")} qualifier={qualifier} aside={aside} reading={sentences.join(" ")}>
        <EventList events={thisWeek} today={today} held={held} dayOf={dayOf} timeOf={timeOf} kindLabel={kindLabel} emptyText={t("emptyWeek")} heldTitle={t("heldTitle")} />
      </Panel>
      <Disclosure label={t("later")} qualifier={t("laterQualifier", { count: later.length })}>
        <EventList events={later} today={today} held={held} dayOf={dayOf} timeOf={timeOf} kindLabel={kindLabel} emptyText={t("emptyLater")} heldTitle={t("heldTitle")} />
      </Disclosure>
      <Disclosure label={t("inflationLabel")} qualifier={inflationRows.length ? t("inflationQualifier", { count: inflationRows.length }) : undefined}>
        {inflationRows.length ? (
          <>
            <DataTable caption={t("inflationLabel")} columns={inflationColumns} rows={inflationRows} rowKey={(r) => r.month} />
            {ex && (
              <p className="card-reading">
                {t("expectations", { y5: pctS(ex.market_5_year, 2), y10: pctS(ex.market_10_year, 2), y1: pctS(ex.model_1_year, 2), target: inflation?.target ?? 2 })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("inflationNone")}</p>
        )}
      </Disclosure>
    </>
  );
}

function EventList({
  events, today, held, dayOf, timeOf, kindLabel, emptyText, heldTitle,
}: {
  events: CalEvent[];
  today: string;
  held: Set<string>;
  dayOf: (iso: string) => string;
  timeOf: (e: CalEvent) => string | null;
  kindLabel: (k: CalKind) => string;
  emptyText: string;
  heldTitle: string;
}) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const days = [...new Set(events.map((e) => e.date))];
  return (
    <ol className="space-y-2.5">
      {days.map((d) => (
        <li key={d}>
          <div className={`stat-label mb-1 ${d === today ? "text-signal" : d < today ? "text-dim" : ""}`}>{dayOf(d)}</div>
          <ul className="space-y-1">
            {events.filter((e) => e.date === d).map((e, i) => {
              const time = timeOf(e);
              const strong = e.weight === "high";
              return (
                <li key={`${e.kind}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span className="nums w-11 shrink-0 font-mono text-[11px] text-muted-foreground">{time ?? "—"}</span>
                  <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{kindLabel(e.kind)}</span>
                  {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
                  {e.note && <span className="nums font-mono text-[11px] text-foreground">{e.note}</span>}
                  {e.tickers?.map((tk) => (
                    <Link key={tk} href={`/stock/${tk}`} className="inline-flex">
                      <Chip tone={held.has(tk) ? "caution" : "plain"} className="font-mono">
                        <span title={held.has(tk) ? heldTitle : undefined}>{tk}</span>
                      </Chip>
                    </Link>
                  ))}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
