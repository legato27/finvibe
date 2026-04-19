"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { osintApi } from "@/lib/api";

// Using a lightweight SVG world map approximation for Phase 7 — no extra map
// library dependency. For production-grade interaction (pan/zoom/clustering),
// swap for react-leaflet or mapbox-gl. GeoJSON payload from /api/osint/map is
// already in the shape either library expects.

export default function OsintMapPage() {
  const [eventType, setEventType] = useState("");
  const [hours, setHours] = useState(24);

  const { data, isLoading } = useQuery({
    queryKey: ["osint-map", eventType, hours],
    queryFn: () => osintApi.map({
      event_type: eventType || undefined,
      since_hours: hours,
      limit: 2000,
    }),
    refetchInterval: 120_000,
  });

  const features = data?.features || [];

  // Map lon [-180,180] → [0,1000], lat [90,-90] → [0,500]
  const project = (lon: number, lat: number) => [
    ((lon + 180) / 360) * 1000,
    ((90 - lat) / 180) * 500,
  ];

  const colorForType = (t: string) => ({
    armed_conflict: "#ef4444", protest: "#f59e0b",
    cyber_advisory: "#06b6d4", cyber_incident: "#06b6d4",
    sanctions_change: "#a855f7", humanitarian: "#22c55e",
    diplomatic: "#3b82f6", economic: "#eab308",
  } as Record<string, string>)[t] || "#94a3b8";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">OSINT — World Map</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value="">All types</option>
          <option value="armed_conflict">Armed conflict</option>
          <option value="cyber_advisory">Cyber</option>
          <option value="sanctions_change">Sanctions</option>
          <option value="humanitarian">Humanitarian</option>
        </select>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 72h</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-slate-400">Loading events…</div>
      ) : (
        <div className="relative w-full aspect-[2/1] bg-slate-900 rounded overflow-hidden border border-slate-700">
          <svg viewBox="0 0 1000 500" className="w-full h-full">
            {/* Simple world-outline placeholder grid (until a real basemap is wired) */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={`h${i}`} x1={0} y1={i * 100} x2={1000} y2={i * 100} stroke="#1e293b" strokeWidth={1} />
            ))}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={500} stroke="#1e293b" strokeWidth={1} />
            ))}
            {features.map((f: {
              geometry?: { coordinates: [number, number] };
              properties?: { event_type?: string; summary?: string };
            }, i: number) => {
              if (!f.geometry?.coordinates) return null;
              const [lon, lat] = f.geometry.coordinates;
              const [x, y] = project(lon, lat);
              const type = f.properties?.event_type || "other";
              return (
                <circle key={i} cx={x} cy={y} r={4}
                  fill={colorForType(type)} fillOpacity={0.7}
                  stroke="#fff" strokeWidth={0.5}>
                  <title>{f.properties?.summary || type}</title>
                </circle>
              );
            })}
          </svg>
          <div className="absolute top-2 right-2 text-xs text-slate-400 bg-slate-900/70 px-2 py-1 rounded">
            {features.length} events
          </div>
        </div>
      )}
      <div className="text-xs text-slate-500">
        Placeholder world grid; swap for react-leaflet or mapbox-gl when a tile key is configured.
        GeoJSON payload from /api/osint/map is already in the shape either expects.
      </div>
    </div>
  );
}
