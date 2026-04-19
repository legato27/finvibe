"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ExternalLink, AlertTriangle, Shield, Scale, Globe, Users, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { osintApi, type OsintEvent } from "@/lib/api";

/** OSINT event feed widget — reusable panel.
 *
 * Modes:
 *   - global  (default): recent events across all types
 *   - ticker:  scoped to a ticker via TICKER_OSINT_EXPOSURE backend map
 *
 * Drop-in compatible with the existing card styling so it fits beside
 * RealtimeNewsFeed on the dashboard and stock pages.
 */

const URGENCY_COLOR: Record<string, string> = {
  low: "text-slate-400 border-slate-700/50",
  medium: "text-amber-400 border-amber-900/50",
  high: "text-orange-400 border-orange-900/50",
  critical: "text-red-400 border-red-900/50",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  armed_conflict: <AlertTriangle className="w-3 h-3 text-red-400" />,
  protest: <Activity className="w-3 h-3 text-amber-400" />,
  cyber_advisory: <Shield className="w-3 h-3 text-cyan-400" />,
  cyber_incident: <Shield className="w-3 h-3 text-cyan-400" />,
  sanctions_change: <Scale className="w-3 h-3 text-purple-400" />,
  humanitarian: <Users className="w-3 h-3 text-green-400" />,
  diplomatic: <Globe className="w-3 h-3 text-blue-400" />,
  regulatory_action: <Scale className="w-3 h-3 text-pink-400" />,
  economic: <Activity className="w-3 h-3 text-yellow-400" />,
};

function typeLabel(t: string) {
  return t.replace(/_/g, " ");
}

interface Props {
  /** When set, fetches events relevant to this ticker via TICKER_OSINT_EXPOSURE. */
  ticker?: string;
  /** Hours of history to show. Default 24 global, 48 ticker. */
  sinceHours?: number;
  /** Max rows in the feed. */
  limit?: number;
  /** Override the panel title. */
  title?: string;
}

export function OsintFeed({ ticker, sinceHours, limit = 60, title }: Props) {
  const hours = sinceHours ?? (ticker ? 48 : 24);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ticker ? ["osint-feed-ticker", ticker, hours] : ["osint-feed-global", hours],
    queryFn: () =>
      ticker
        ? osintApi.eventsForTicker(ticker, hours, limit)
        : osintApi.events({ since_hours: hours, limit }),
    refetchInterval: 2 * 60 * 1000, // 2 min
    staleTime: 90 * 1000,
  });

  const heading =
    title ?? (ticker ? `OSINT — ${ticker}` : "OSINT — Global");

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{heading}</span>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{events.length} events · last {hours}h</span>
          <Link href="/osint" className="text-primary hover:underline">all →</Link>
        </div>
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {isLoading && (
          <div className="text-slate-500 text-sm animate-pulse py-4 text-center">
            Loading OSINT feed…
          </div>
        )}
        {!isLoading && events.length === 0 && (
          <div className="text-slate-500 text-sm py-4 text-center">
            {ticker
              ? `No OSINT events touch ${ticker} in the last ${hours}h.`
              : "No OSINT events yet — crawler runs every 10–15 min."}
          </div>
        )}
        {events.map((ev: OsintEvent) => <OsintEventRow key={ev.id} event={ev} />)}
      </div>
    </div>
  );
}

function OsintEventRow({ event }: { event: OsintEvent }) {
  const urgencyCls = URGENCY_COLOR[event.urgency] || URGENCY_COLOR.low;

  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg border bg-white/[0.02] hover:bg-white/5 transition-colors ${urgencyCls}`}>
      <div className="flex-shrink-0 mt-0.5">
        {TYPE_ICON[event.event_type] ?? <Activity className="w-3 h-3 text-slate-500" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 text-xs text-slate-500">
          <span className="uppercase tracking-wide">{typeLabel(event.event_type)}</span>
          <span className="px-1 py-0.5 rounded bg-slate-800/80 text-slate-400 text-[10px]">
            {event.urgency}
          </span>
          {event.country_code && (
            <span className="px-1 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono text-[10px]">
              {event.country_code}
            </span>
          )}
          {event.location_name && (
            <span className="truncate">· {event.location_name}</span>
          )}
          {event.occurred_at && (
            <span className="ml-auto flex-shrink-0">
              {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
            </span>
          )}
        </div>

        <div className="flex items-start gap-1">
          <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 flex-1">
            {event.summary || <span className="italic text-slate-600">no summary</span>}
          </p>
          {event.primary_article_url && (
            <a
              href={event.primary_article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-slate-600 hover:text-primary"
              title="Open source"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {event.actors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {event.actors.slice(0, 4).map((a) => (
              <Link
                key={`${a.id}-${a.role}`}
                href={`/osint/actors/${encodeURIComponent(a.id)}`}
                className="text-[10px] px-1.5 py-0.5 bg-slate-800/70 hover:bg-slate-700 rounded text-slate-300"
                title={a.role}
              >
                {a.name}
              </Link>
            ))}
            {event.actors.length > 4 && (
              <span className="text-[10px] text-slate-500 px-1">+{event.actors.length - 4}</span>
            )}
          </div>
        )}
      </div>

      <span className="flex-shrink-0 text-[10px] text-slate-500 font-mono">
        {event.verification_level.split("_")[0]}
      </span>
    </div>
  );
}
