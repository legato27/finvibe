"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { osintApi, type OsintEvent } from "@/lib/api";
import { Activity, AlertTriangle, Globe, Shield, Scale, Users } from "lucide-react";

const EVENT_TYPES = [
  { v: "", label: "All" },
  { v: "armed_conflict", label: "Armed conflict" },
  { v: "protest", label: "Protest" },
  { v: "cyber_advisory", label: "Cyber advisory" },
  { v: "cyber_incident", label: "Cyber incident" },
  { v: "sanctions_change", label: "Sanctions" },
  { v: "regulatory_action", label: "Regulatory" },
  { v: "humanitarian", label: "Humanitarian" },
  { v: "diplomatic", label: "Diplomatic" },
  { v: "economic", label: "Economic" },
];

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-slate-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
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
        <Activity className="h-6 w-6 text-blue-500" />
        <h1 className="text-2xl font-bold">OSINT — Events</h1>
        <div className="ml-auto flex gap-2 text-sm">
          <Link href="/osint/map" className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600">Map</Link>
          <Link href="/osint/timeline" className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600">Timeline</Link>
          <Link href="/osint/indices" className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600">Indices</Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 p-3 bg-slate-800/50 rounded">
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          {EVENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value="">Any urgency</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 72h</option>
          <option value={168}>Last 7d</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-slate-400">Loading…</div>
      ) : !events?.length ? (
        <div className="text-slate-500">No events matched.</div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => <EventRow key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: OsintEvent }) {
  return (
    <div className="flex gap-3 p-3 bg-slate-800/30 rounded border border-slate-700/50 hover:bg-slate-800/50">
      <div className={`w-1 rounded ${URGENCY_COLORS[event.urgency] || "bg-slate-500"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {TYPE_ICON[event.event_type] || null}
          <span>{event.event_type}</span>
          {event.country_code && <span className="px-1 bg-slate-700 rounded">{event.country_code}</span>}
          {event.location_name && <span>· {event.location_name}</span>}
          <span className="ml-auto">{event.verification_level}</span>
        </div>
        <div className="mt-1 text-sm text-slate-200">
          {event.summary || <span className="italic text-slate-500">no summary</span>}
        </div>
        <div className="mt-1 flex gap-2 text-xs text-slate-400">
          {event.actors.slice(0, 5).map((a) => (
            <Link key={`${a.id}-${a.role}`} href={`/osint/actors/${encodeURIComponent(a.id)}`}
              className="px-1.5 py-0.5 bg-slate-700 rounded hover:bg-slate-600">
              {a.name}<span className="text-slate-500 ml-1">({a.role})</span>
            </Link>
          ))}
          {event.primary_article_url && (
            <a href={event.primary_article_url} target="_blank" rel="noreferrer"
              className="ml-auto underline hover:text-slate-200">
              source →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
