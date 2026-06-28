"use client";
import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { osintApi } from "@/lib/api";

type ActorDetail = {
  id: string;
  kind: string;
  name: string;
  recent_events: {
    id: string;
    event_type: string;
    urgency: string;
    occurred_at: string | null;
    summary: string | null;
    role: string;
  }[];
};

export default function ActorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("osint");
  const tc = useTranslations("common");
  const { id } = use(params);
  const decoded = decodeURIComponent(id);

  const { data, isLoading } = useQuery<ActorDetail>({
    queryKey: ["osint-actor", decoded],
    queryFn: () => osintApi.actor(decoded),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">{tc("loading")}</div>;
  if (!data) return <div className="p-6 text-muted-foreground">{t("actorNotFound")}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Link href="/osint" className="text-sm text-muted-foreground hover:text-foreground">{t("backToFeed")}</Link>
      <div className="p-4 bg-card rounded border border-border">
        <div className="text-xs text-muted-foreground uppercase">{data.kind}</div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <div className="text-xs text-muted-foreground mt-1">{data.id}</div>
      </div>

      <h2 className="text-lg font-semibold">{t("recentEventsCount", { count: data.recent_events.length })}</h2>
      <div className="space-y-2">
        {data.recent_events.map((ev) => (
          <Link key={ev.id} href={`/osint?event=${ev.id}`}
            className="block p-3 bg-muted/30 rounded border border-border/60 hover:bg-muted/60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{ev.event_type}</span>
              <span className="px-1.5 py-0.5 bg-muted rounded">{ev.urgency}</span>
              <span className="px-1.5 py-0.5 bg-muted rounded">{t("roleLabel", { role: ev.role })}</span>
              {ev.occurred_at && <span className="ml-auto">{new Date(ev.occurred_at).toLocaleString()}</span>}
            </div>
            <div className="mt-1 text-sm text-foreground">{ev.summary || <span className="italic text-muted-foreground">{t("noSummary")}</span>}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
