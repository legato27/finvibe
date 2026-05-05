"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function McpConnectionGuide() {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  const url = origin ? `${origin}/api/mcp/mcp` : "/api/mcp/mcp";

  return (
    <div className="card mt-4">
      <div className="card-header">
        <span className="card-title">How to connect a client</span>
      </div>
      <div className="p-4 space-y-4 text-xs text-foreground/90">
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-foreground">
            A. Easiest path — let the client OAuth itself in (recommended)
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>Open your MCP-capable client (Claude Code, Claude Desktop, Cursor, Cline, …).</li>
            <li>
              Add a new MCP server with this URL and{" "}
              <span className="text-foreground">no auth header</span>:
              <pre className="mt-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded p-2 overflow-x-auto">
                {url}
              </pre>
            </li>
            <li>
              The client will hit the endpoint, get a <code>401</code>, and follow
              the OAuth discovery flow automatically. Your browser will open to
              vibefin.
            </li>
            <li>Sign in (if needed) → you&apos;ll see a consent page → click Approve.</li>
            <li>
              The client receives an access token and the server appears under{" "}
              <span className="text-foreground">Connected apps (OAuth)</span>{" "}
              below. Done.
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-foreground">
            B. Personal token (for clients without OAuth, or one-shot scripts)
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>
              Use the <span className="text-foreground">MCP integration</span>{" "}
              card above → &ldquo;Generate&rdquo;. Copy the <code>vbf_…</code> secret
              once.
            </li>
            <li>
              In your client&apos;s config, add the URL with{" "}
              <code>Authorization: Bearer &lt;your-token&gt;</code>. Example for
              Claude Code:
              <pre className="mt-1 font-mono text-[11px] text-foreground bg-background/60 border border-border/60 rounded p-2 overflow-x-auto">
{`claude mcp add --transport http vibefin ${url} \\
  --header "Authorization: Bearer vbf_<your-token>"`}
              </pre>
            </li>
            <li>
              Or in Claude Desktop&apos;s <code>claude_desktop_config.json</code> /
              Cursor&apos;s <code>~/.cursor/mcp.json</code>:
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
            C. Manual OAuth client (for advanced setups)
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>
              Use &ldquo;Register a connected app manually&rdquo; below to create a
              <code>client_id</code> with your own redirect URI.
            </li>
            <li>
              Configure your client to use that <code>client_id</code> against
              issuer <code className="font-mono">{origin}/api/mcp/oauth</code>.
            </li>
            <li>
              The standard OAuth 2.1 flow follows from there: PKCE + browser
              consent + token exchange. Tokens issued via this client appear under
              Connected apps too.
            </li>
          </ol>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
          See the{" "}
          <Link href="/mcp" className="underline">
            full MCP API reference
          </Link>{" "}
          for the list of tools your client can call.
        </p>
      </div>
    </div>
  );
}
