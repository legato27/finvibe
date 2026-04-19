"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { osintApi } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";

const EVENT_TYPES = [
  "armed_conflict", "protest", "cyber_advisory", "cyber_incident",
  "sanctions_change", "humanitarian", "diplomatic", "economic", "regulatory_action", "other",
];

const COLORS: Record<string, string> = {
  armed_conflict: "#ef4444", protest: "#f59e0b",
  cyber_advisory: "#06b6d4", cyber_incident: "#0891b2",
  sanctions_change: "#a855f7", humanitarian: "#22c55e",
  diplomatic: "#3b82f6", economic: "#eab308",
  regulatory_action: "#ec4899", other: "#94a3b8",
};

export default function OsintTimelinePage() {
  const [granularity, setGranularity] = useState<"hour" | "day">("hour");
  const [hours, setHours] = useState(168);

  const { data, isLoading } = useQuery({
    queryKey: ["osint-timeline", granularity, hours],
    queryFn: () => osintApi.timeline({ granularity, since_hours: hours }),
    refetchInterval: 300_000,
  });

  // Pivot rows → stacked chart shape: { ts, armed_conflict, protest, ... }
  const chartData = useMemo(() => {
    const byTs: Record<string, Record<string, number>> = {};
    for (const row of data || []) {
      byTs[row.ts] ??= { ts: row.ts } as Record<string, number>;
      byTs[row.ts][row.event_type] = row.count;
    }
    return Object.values(byTs).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }, [data]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">OSINT — Timeline</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as "hour" | "day")}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value="hour">Hourly buckets</option>
          <option value="day">Daily buckets</option>
        </select>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value={24}>Last 24h</option>
          <option value={72}>Last 72h</option>
          <option value={168}>Last 7d</option>
          <option value={720}>Last 30d</option>
        </select>
      </div>

      <div className="h-[400px] bg-slate-900 rounded p-4 border border-slate-700">
        {isLoading ? (
          <div className="text-slate-400">Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="ts" tick={{ fontSize: 10 }} stroke="#94a3b8"
                tickFormatter={(v) => String(v).slice(5, 16)} />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {EVENT_TYPES.map((t) => (
                <Bar key={t} dataKey={t} stackId="a" fill={COLORS[t]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
