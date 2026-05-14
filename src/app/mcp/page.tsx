import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TOOL_CATALOG, type ToolDoc, type ToolGroup } from "@/lib/mcp/catalog";

export const metadata = {
  title: "MCP API · vibefin",
  description:
    "Model Context Protocol endpoint and tool reference for vibefin. " +
    "Open standard — works with Claude, ChatGPT (custom GPTs / MCP), Cursor, " +
    "Cline, Continue, Windsurf, and any other MCP-compatible client.",
};

const GROUP_ORDER: ToolGroup[] = [
  "Profile",
  "Watchlists",
  "Portfolios",
  "Holdings",
  "Sales",
  "Market data",
  "AI",
];

const GROUP_KEY: Record<ToolGroup, string> = {
  Profile: "groupProfile",
  Watchlists: "groupWatchlists",
  Portfolios: "groupPortfolios",
  Holdings: "groupHoldings",
  Sales: "groupSales",
  "Market data": "groupMarketData",
  AI: "groupAI",
};

function ToolCard({
  tool,
  t,
}: {
  tool: ToolDoc;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <div id={tool.name} className="card">
      <div className="card-header flex items-center justify-between">
        <code className="card-title font-mono text-sm">{tool.name}</code>
        <span className="text-[10px] text-muted-foreground">{t(GROUP_KEY[tool.group])}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-sm text-foreground">{tool.title}</div>
        <p className="text-xs text-muted-foreground">{tool.description}</p>

        {tool.params.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("parameters")}
            </div>
            <div className="border border-border/40 rounded-lg overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-background/40">
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">{t("colName")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("colType")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("colRequired")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("colNotes")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {tool.params.map((p) => (
                    <tr key={p.name}>
                      <td className="px-2 py-1.5 font-mono">{p.name}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">
                        {p.type}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {p.required ? t("yes") : t("no")}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {p.description ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">
            {t("noParams")}
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {t("returns")}
          </div>
          <div className="text-xs text-foreground/90 font-mono bg-background/40 border border-border/40 rounded p-2">
            {tool.returns}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function McpDocsPage() {
  const t = await getTranslations("mcpDocs");
  const grouped: Record<ToolGroup, ToolDoc[]> = {
    Profile: [],
    Watchlists: [],
    Portfolios: [],
    Holdings: [],
    Sales: [],
    "Market data": [],
    AI: [],
  };
  for (const tool of TOOL_CATALOG) grouped[tool.group].push(tool);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> {t("backToHome")}
      </Link>

      <h1 className="text-2xl font-bold text-foreground mb-1">
        {t("title")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("intro")}
      </p>

      {/* Endpoint and auth */}
      <div className="card mb-6">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">{t("endpoint")}</span>
          <span className="text-[10px] text-muted-foreground">
            {t("endpointBadge")}
          </span>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("url")}
            </div>
            <code className="font-mono text-foreground bg-background/40 border border-border/40 rounded px-2 py-1.5 inline-block">
              https://fin.vibelife.sg/api/mcp/mcp
            </code>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("authentication")}
            </div>
            <div className="text-foreground/90">
              {t("authBodyPre")}{" "}
              <code className="font-mono text-[11px]">
                Authorization: Bearer vbf_…
              </code>
              {t("authBodyMid")}{" "}
              <Link
                href="/settings"
                className="underline text-primary hover:text-primary/80"
              >
                /settings
              </Link>{" "}
              {t("authBodySuffix")}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("transport")}
            </div>
            <div className="text-foreground/90">
              {t("transportBody")}
            </div>
          </div>
        </div>
      </div>

      {/* Connection snippets */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">{t("connectClient")}</span>
        </div>
        <div className="p-4 space-y-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("snippetGeneric")}
            </div>
            <pre className="font-mono text-[11px] text-foreground bg-background/40 border border-border/40 rounded p-2 overflow-x-auto">{`curl -X POST https://fin.vibelife.sg/api/mcp/mcp \\
  -H "Authorization: Bearer vbf_<your-token>" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"tools/call",
    "params":{"name":"list_watchlists","arguments":{}}
  }'`}</pre>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("snippetClaudeCode")}
            </div>
            <pre className="font-mono text-[11px] text-foreground bg-background/40 border border-border/40 rounded p-2 overflow-x-auto">{`claude mcp add --transport http vibefin https://fin.vibelife.sg/api/mcp/mcp \\
  --header "Authorization: Bearer vbf_<your-token>"`}</pre>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("snippetClaudeDesktopPre")}
              <code className="font-mono">claude_desktop_config.json</code>
            </div>
            <pre className="font-mono text-[11px] text-foreground bg-background/40 border border-border/40 rounded p-2 overflow-x-auto">{`{
  "mcpServers": {
    "vibefin": {
      "url": "https://fin.vibelife.sg/api/mcp/mcp",
      "headers": { "Authorization": "Bearer vbf_<your-token>" }
    }
  }
}`}</pre>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("snippetCursorPre")}<code className="font-mono">~/.cursor/mcp.json</code>
            </div>
            <pre className="font-mono text-[11px] text-foreground bg-background/40 border border-border/40 rounded p-2 overflow-x-auto">{`{
  "mcpServers": {
    "vibefin": {
      "url": "https://fin.vibelife.sg/api/mcp/mcp",
      "headers": { "Authorization": "Bearer vbf_<your-token>" }
    }
  }
}`}</pre>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("snippetOther")}
            </div>
            <p className="text-foreground/90">
              {t("snippetOtherBodyPre")}{" "}
              <code className="font-mono">Authorization</code> {t("snippetOtherBodySuffix")}
            </p>
          </div>
        </div>
      </div>

      {/* Tools */}
      <h2 className="text-lg font-semibold text-foreground mb-3">
        {t("toolsHeading", { count: TOOL_CATALOG.length })}
      </h2>

      {GROUP_ORDER.map((group) => {
        const tools = grouped[group];
        if (!tools.length) return null;
        return (
          <section key={group} className="mb-8">
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">
              {t(GROUP_KEY[group])}
            </h3>
            <div className="space-y-3">
              {tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} t={t} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-4 mt-8">
        {t("openStandard")}{" "}
        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          modelcontextprotocol.io
        </a>
      </div>
    </div>
  );
}
