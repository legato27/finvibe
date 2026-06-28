"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { osintApi, type OsintEvent } from "@/lib/api";
import { Activity, AlertTriangle, Globe, Shield, Scale, Users } from "lucide-react";

const EVENT_TYPE_VALUES = [
  "", "armed_conflict", "protest", "cyber_advisory", "cyber_incident",
  "sanctions_change", "regulatory_action", "humanitarian", "diplomatic", "economic",
];
const EVENT_TYPE_LABEL_KEYS: Record<string, string> = {
  "": "etAll",
  armed_conflict: "etArmedConflict",
  protest: "etProtest",
  cyber_advisory: "etCyberAdvisory",
  cyber_incident: "etCyberIncident",
  sanctions_change: "etSanctions",
  regulatory_action: "etRegulatory",
  humanitarian: "etHumanitarian",
  diplomatic: "etDiplomatic",
  economic: "etEconomic",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-signal-neutral",
  medium: "bg-signal-caution",
  high: "bg-signal-short",
  critical: "bg-signal-short-strong",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  armed_conflict: <AlertTriangle className="h-4 w-4" />,
  cyber_advisory: <Shield className="h-4 w-4" />,
  cyber_incident: <Shield className="h-4 w-4" />,
  sanctions_change: <Scale className="h-4 w-4" />,
  humanitarian: <Users className="h-4 w-4" />,
  diplomatic: <Globe className="h-4 w-4" />,
};

export default function OsintFeedPage() {
  const t = useTranslations("osint");
  const tc = useTranslations("common");
  const [eventType, setEventType] = useState("");
  const [urgency, setUrgency] = useState("");
  const [hours, setHours] = useState(24);

  const { data: events, isLoading } = useQuery({
    queryKey: ["osint-events", eventType, urgency, hours],
    queryFn: () => osintApi.events({
      event_type: eventType || undefined,
      urgency: urgency || undefined,
      since_hours: hours,
      limit: 200,
    }),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t("eventsTitle")}</h1>
        <div className="ml-auto flex gap-1.5">
          {[
            { href: "/osint/map", label: t("mapTab") },
            { href: "/osint/timeline", label: t("timelineTab") },
            { href: "/osint/indices", label: t("indicesTab") },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-md font-mono text-xs font-semibold border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 p-3 bg-card/60 rounded">
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}
          className="bg-muted border border-border text-foreground rounded px-2 py-1 text-sm">
          {EVENT_TYPE_VALUES.map((v) => <option key={v} value={v}>{t(EVENT_TYPE_LABEL_KEYS[v])}</option>)}
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)}
          className="bg-muted border border-border text-foreground rounded px-2 py-1 text-sm">
          <option value="">{t("anyUrgency")}</option>
          <option value="critical">{t("urgencyCritical")}</option>
          <option value="high">{t("urgencyHigh")}</option>
          <option value="medium">{t("urgencyMedium")}</option>
          <option value="low">{t("urgencyLow")}</option>
        </select>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="bg-muted border border-border text-foreground rounded px-2 py-1 text-sm">
          <option value={6}>{t("last6h")}</option>
          <option value={24}>{t("last24h")}</option>
          <option value={72}>{t("last72h")}</option>
          <option value={168}>{t("last7d")}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">{tc("loading")}</div>
      ) : !events?.length ? (
        <div className="text-muted-foreground">{t("noEventsMatched")}</div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => <EventRow key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: OsintEvent }) {
  const t = useTranslations("osint");
  return (
    <div className="flex gap-3 p-3 bg-muted/30 rounded border border-border/60 hover:bg-card/60">
      <div className={`w-1 rounded ${URGENCY_COLORS[event.urgency] || "bg-signal-neutral"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {TYPE_ICON[event.event_type] || null}
          <span>{event.event_type}</span>
          {event.country_code && <span className="px-1 bg-muted rounded">{event.country_code}</span>}
          {event.location_name && <span>· {event.location_name}</span>}
          <span className="ml-auto">{event.verification_level}</span>
        </div>
        <div className="mt-1 text-sm text-foreground">
          {event.summary || <span className="italic text-muted-foreground">{t("noSummary")}</span>}
        </div>
        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
          {event.actors.slice(0, 5).map((a) => (
            <Link key={`${a.id}-${a.role}`} href={`/osint/actors/${encodeURIComponent(a.id)}`}
              className="px-1.5 py-0.5 bg-muted rounded hover:bg-accent">
              {a.name}<span className="text-muted-foreground ml-1">({a.role})</span>
            </Link>
          ))}
          {event.primary_article_url && (
            <a href={event.primary_article_url} target="_blank" rel="noreferrer"
              className="ml-auto underline hover:text-foreground">
              {t("sourceLink")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
