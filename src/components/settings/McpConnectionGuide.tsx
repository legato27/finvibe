"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function McpConnectionGuide() {
  const t = useTranslations("settings");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  const url = origin ? `${origin}/api/mcp/mcp` : "/api/mcp/mcp";

  return (
    <div className="card mt-4">
      <div className="card-header">
        <span className="card-title">{t("guide.cardTitle")}</span>
      </div>
      <div className="p-4 space-y-4 text-xs text-foreground/90">
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-foreground">
            {t("guide.aTitle")}
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>{t("guide.a1")}</li>
            <li>
              {t("guide.a2Pre")}
              <span className="text-foreground">{t("guide.a2NoAuth")}</span>
              {t("guide.a2Suffix")}
              <pre className="mt-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded p-2 overflow-x-auto">
                {url}
              </pre>
            </li>
            <li>{t("guide.a3")}</li>
            <li>{t("guide.a4")}</li>
            <li>
              {t("guide.a5Pre")}
              <span className="text-foreground">{t("guide.a5Mid")}</span>
              {t("guide.a5Suffix")}
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-foreground">
            {t("guide.bTitle")}
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>
              {t("guide.b1Pre")}
              <span className="text-foreground">{t("guide.b1Mid")}</span>
              {t("guide.b1Suffix")}
            </li>
            <li>
              {t("guide.b2Pre")}
              <code>Authorization: Bearer &lt;your-token&gt;</code>
              {t("guide.b2Suffix")}
              <pre className="mt-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded p-2 overflow-x-auto">
{`claude mcp add --transport http vibefin ${url} \\
  --header "Authorization: Bearer vbf_<your-token>"`}
              </pre>
            </li>
            <li>
              {t("guide.b3Pre")}
              <pre className="mt-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded p-2 overflow-x-auto">
{`{
  "mcpServers": {
    "vibefin": {
      "url": "${url}",
      "headers": { "Authorization": "Bearer vbf_<your-token>" }
    }
  }
}`}
              </pre>
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-foreground">
            {t("guide.cTitle")}
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>{t("guide.c1Pre")}</li>
            <li>
              {t("guide.c2Pre")}
              <code className="font-mono">{origin}/api/mcp/oauth</code>
            </li>
            <li>{t("guide.c3")}</li>
          </ol>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
          {t("guide.refLinkPre")}
          <Link href="/mcp" className="underline">
            {t("guide.refLinkText")}
          </Link>
          {t("guide.refLinkSuffix")}
        </p>
      </div>
    </div>
  );
}
