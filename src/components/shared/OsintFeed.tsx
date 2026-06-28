"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  low: "text-muted-foreground border-border/50",
  medium: "text-warning border-warning/50",
  high: "text-warning border-warning/50",
  critical: "text-danger border-danger/50",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  armed_conflict: <AlertTriangle className="w-3 h-3 text-danger" />,
  protest: <Activity className="w-3 h-3 text-warning" />,
  cyber_advisory: <Shield className="w-3 h-3 text-primary" />,
  cyber_incident: <Shield className="w-3 h-3 text-primary" />,
  sanctions_change: <Scale className="w-3 h-3 text-signal-conflict" />,
  humanitarian: <Users className="w-3 h-3 text-success" />,
  diplomatic: <Globe className="w-3 h-3 text-primary" />,
  regulatory_action: <Scale className="w-3 h-3 text-danger" />,
  economic: <Activity className="w-3 h-3 text-warning" />,
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
  const t = useTranslations("osint");
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
    title ?? (ticker ? `OSINT — ${ticker}` : t("globalHeading"));

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{heading}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("eventsCountLastHours", { count: events.length, hours })}</span>
          <Link href="/osint" className="text-primary hover:underline">{t("allLink")}</Link>
        </div>
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {isLoading && (
          <div className="text-muted-foreground text-sm animate-pulse py-4 text-center">
            {t("loadingFeed")}
          </div>
        )}
        {!isLoading && events.length === 0 && (
          <div className="text-muted-foreground text-sm py-4 text-center">
            {ticker
              ? t("noEventsForTicker", { ticker, hours })
              : t("noEventsYet")}
          </div>
        )}
        {events.map((ev: OsintEvent) => <OsintEventRow key={ev.id} event={ev} />)}
      </div>
    </div>
  );
}

function OsintEventRow({ event }: { event: OsintEvent }) {
  const t = useTranslations("osint");
  const urgencyCls = URGENCY_COLOR[event.urgency] || URGENCY_COLOR.low;

  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg border bg-white/[0.02] hover:bg-white/5 transition-colors ${urgencyCls}`}>
      <div className="flex-shrink-0 mt-0.5">
        {TYPE_ICON[event.event_type] ?? <Activity className="w-3 h-3 text-muted-foreground" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">{typeLabel(event.event_type)}</span>
          <span className="px-1 py-0.5 rounded bg-muted/80 text-muted-foreground text-[10px]">
            {event.urgency}
          </span>
          {event.country_code && (
            <span className="px-1 py-0.5 rounded bg-muted/80 text-muted-foreground font-mono text-[10px]">
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
          <p className="text-xs text-foreground leading-relaxed line-clamp-2 flex-1">
            {event.summary || <span className="italic text-muted-foreground">{t("noSummary")}</span>}
          </p>
          {event.primary_article_url && (
            <a
              href={event.primary_article_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-muted-foreground hover:text-primary"
              title={t("openSource")}
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
                className="text-[10px] px-1.5 py-0.5 bg-muted/70 hover:bg-muted rounded text-foreground"
                title={a.role}
              >
                {a.name}
              </Link>
            ))}
            {event.actors.length > 4 && (
              <span className="text-[10px] text-muted-foreground px-1">+{event.actors.length - 4}</span>
            )}
          </div>
        )}
      </div>

      <span className="flex-shrink-0 text-[10px] text-muted-foreground font-mono">
        {event.verification_level.split("_")[0]}
      </span>
    </div>
  );
}
