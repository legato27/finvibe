import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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

function ToolCard({ tool }: { tool: ToolDoc }) {
  return (
    <div id={tool.name} className="card">
      <div className="card-header flex items-center justify-between">
        <code className="card-title font-mono text-sm">{tool.name}</code>
        <span className="text-[10px] text-muted-foreground">{tool.group}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-sm text-foreground">{tool.title}</div>
        <p className="text-xs text-muted-foreground">{tool.description}</p>

        {tool.params.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Parameters
            </div>
            <div className="border border-border/40 rounded-lg overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-background/40">
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    <th className="px-2 py-1.5 font-medium">Required</th>
                    <th className="px-2 py-1.5 font-medium">Notes</th>
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
                        {p.required ? "yes" : "no"}
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
            No parameters.
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Returns
          </div>
          <div className="text-xs text-foreground/90 font-mono bg-background/40 border border-border/40 rounded p-2">
            {tool.returns}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function McpDocsPage() {
  const grouped: Record<ToolGroup, ToolDoc[]> = {
    Profile: [],
    Watchlists: [],
    Portfolios: [],
    Holdings: [],
    Sales: [],
    "Market data": [],
    AI: [],
  };
  for (const t of TOOL_CATALOG) grouped[t.group].push(t);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-foreground mb-1">
        MCP API reference
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        vibefin exposes a Model Context Protocol server so any MCP-compatible
        client &mdash; Claude Desktop, Claude Code, Cursor, Cline, Continue,
        Windsurf, ChatGPT custom GPTs (via MCP), or your own &mdash; can manage
        watchlists, portfolios, holdings, sells, and read market data on your
        behalf.
      </p>

      {/* Endpoint and auth */}
      <div className="card mb-6">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">Endpoint</span>
          <span className="text-[10px] text-muted-foreground">
            Streamable HTTP &middot; MCP 2025-03-26
          </span>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              URL
            </div>
            <code className="font-mono text-foreground bg-background/40 border border-border/40 rounded px-2 py-1.5 inline-block">
              https://fin.vibelife.sg/api/mcp/mcp
            </code>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Authentication
            </div>
            <div className="text-foreground/90">
              Per-user personal access token sent as{" "}
              <code className="font-mono text-[11px]">
                Authorization: Bearer vbf_…
              </code>
              . Generate one at{" "}
              <Link
                href="/settings"
                className="underline text-primary hover:text-primary/80"
              >
                /settings
              </Link>{" "}
              while signed in. Tokens scope every request to your own data.
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Transport
            </div>
            <div className="text-foreground/90">
              Streamable HTTP (the current MCP spec, March 2025 revision).
              Stateless &mdash; each request stands alone, no session resumption
              required.
            </div>
          </div>
        </div>
      </div>

      {/* Connection snippets */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Connect a client</span>
        </div>
        <div className="p-4 space-y-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Generic JSON-RPC over HTTP
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
              Claude Code
            </div>
            <pre className="font-mono text-[11px] text-foreground bg-background/40 border border-border/40 rounded p-2 overflow-x-auto">{`claude mcp add --transport http vibefin https://fin.vibelife.sg/api/mcp/mcp \\
  --header "Authorization: Bearer vbf_<your-token>"`}</pre>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Claude Desktop &middot;{" "}
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
              Cursor &middot; <code className="font-mono">~/.cursor/mcp.json</code>
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
              Cline / Continue / Windsurf / other MCP clients
            </div>
            <p className="text-foreground/90">
              Any client that supports the Streamable HTTP transport will work.
              Point it at the URL above with the same{" "}
              <code className="font-mono">Authorization</code> header.
            </p>
          </div>
        </div>
      </div>

      {/* Tools */}
      <h2 className="text-lg font-semibold text-foreground mb-3">
        Tools ({TOOL_CATALOG.length})
      </h2>

      {GROUP_ORDER.map((group) => {
        const tools = grouped[group];
        if (!tools.length) return null;
        return (
          <section key={group} className="mb-8">
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">
              {group}
            </h3>
            <div className="space-y-3">
              {tools.map((t) => (
                <ToolCard key={t.name} tool={t} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-4 mt-8">
        MCP is an open standard.{" "}
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
