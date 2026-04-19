"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { osintApi, type OsintIndex } from "@/lib/api";

export default function OsintIndicesPage() {
  const [region, setRegion] = useState("");
  const [window, setWindow] = useState(24);

  const { data, isLoading } = useQuery({
    queryKey: ["osint-indices", region, window],
    queryFn: () => osintApi.indices({ region: region || undefined, window }),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">OSINT — Risk Indices</h1>

      <div className="flex flex-wrap gap-2">
        <input value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())}
          placeholder="Region (ISO, e.g. UA)" maxLength={2}
          className="bg-slate-700 rounded px-2 py-1 text-sm w-44" />
        <select value={window} onChange={(e) => setWindow(Number(e.target.value))}
          className="bg-slate-700 rounded px-2 py-1 text-sm">
          <option value={6}>6h window</option>
          <option value={24}>24h window</option>
          <option value={72}>72h window</option>
          <option value={168}>7d window</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data || []).map((ix: OsintIndex) => <IndexCard key={ix.index_name} ix={ix} />)}
        </div>
      )}
    </div>
  );
}

function IndexCard({ ix }: { ix: OsintIndex }) {
  const color = ix.index_name === "geopolitical_risk" ? "bg-red-600"
              : ix.index_name === "sanctions_pressure" ? "bg-purple-600"
              : "bg-cyan-600";
  return (
    <div className="p-4 bg-slate-800 rounded border border-slate-700">
      <div className="text-xs text-slate-400 uppercase">{ix.index_name.replace(/_/g, " ")}</div>
      <div className={`mt-2 inline-block px-3 py-1 rounded text-white ${color}`}>
        <span className="text-3xl font-bold">{ix.value}</span>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {ix.window_hours}h window · updated {new Date(ix.as_of).toLocaleTimeString()}
      </div>
      <div className="mt-3 space-y-1">
        {Object.entries(ix.components).map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-slate-400">{k.replace(/_/g, " ")}</span>
            <span className="font-mono text-slate-200">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
