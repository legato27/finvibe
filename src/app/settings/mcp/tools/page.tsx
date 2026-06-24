import Link from "next/link";
import {
  TOOL_CATALOG,
  toolAccess,
  type ToolAccess,
  type ToolDoc,
  type ToolGroup,
} from "@/lib/mcp/catalog";

export const metadata = { title: "Tools & reference · MCP · vibefin" };

const ENDPOINT = "https://fin.vibelife.sg/api/mcp/mcp";

const GROUP_ORDER: ToolGroup[] = [
  "Profile",
  "Watchlists",
  "Portfolios",
  "Holdings",
  "Sales",
  "Market data",
  "Options",
  "News & sentiment",
  "AI",
];

// The minimum scope that may call a tool, derived from its access class.
//   read tools        → any scope (read / manage / full)
//   user-data writes  → manage or full
//   other writes      → full only
const ACCESS_TO_SCOPE: Record<ToolAccess, { label: string; cls: string }> = {
  read: { label: "read", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  write_user: { label: "manage", cls: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  write_other: { label: "full", cls: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
};

function ScopeBadge({ access }: { access: ToolAccess }) {
  const s = ACCESS_TO_SCOPE[access];
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.cls}`}
      title={`Minimum scope required: ${s.label}`}
    >
      {s.label}
    </span>
  );
}

function ToolRow({ tool }: { tool: ToolDoc }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <code className="font-mono text-xs text-foreground">{tool.name}</code>
        <p className="text-[11px] text-muted-foreground mt-0.5">{tool.description}</p>
      </div>
      <ScopeBadge access={toolAccess(tool.name)} />
    </div>
  );
}

export default function McpToolsPage() {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    tools: TOOL_CATALOG.filter((t) => t.group === group),
  })).filter((g) => g.tools.length > 0);

  const readCount = TOOL_CATALOG.filter((t) => toolAccess(t.name) === "read").length;
  const manageCount = TOOL_CATALOG.filter((t) => toolAccess(t.name) !== "write_other").length;
  const fullCount = TOOL_CATALOG.length;

  return (
    <div className="space-y-4">
      {/* ── Connection ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">Connection</span>
          <span className="text-[10px] text-muted-foreground">Streamable HTTP · OAuth or token</span>
        </div>
        <div className="p-4 space-y-4 text-xs text-foreground/90">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Endpoint
            </div>
            <code className="font-mono text-foreground bg-background/40 border border-border/40 rounded px-2 py-1.5 inline-block">
              {ENDPOINT}
            </code>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="border border-border/40 rounded-lg p-3 space-y-1.5">
              <div className="text-[11px] font-medium text-foreground">
                A · Hosted Claude (claude.ai, Desktop, mobile, Cowork)
              </div>
              <p className="text-muted-foreground">
                Settings → Connectors → <span className="text-foreground">Add custom connector</span>,
                paste the endpoint, sign in and approve a scope. OAuth 2.1 — no token to copy.
              </p>
              <Link href="/settings/mcp/oauth" className="text-primary hover:text-primary/80 underline">
                Connected apps →
              </Link>
            </div>
            <div className="border border-border/40 rounded-lg p-3 space-y-1.5">
              <div className="text-[11px] font-medium text-foreground">
                B · CLI &amp; editors (Claude Code, Cursor, Cline, scripts)
              </div>
              <p className="text-muted-foreground">
                Create a personal token and send it as{" "}
                <code className="font-mono text-[11px]">Authorization: Bearer vbf_…</code> on every
                request.
              </p>
              <Link href="/settings/mcp/tokens" className="text-primary hover:text-primary/80 underline">
                Create a token →
              </Link>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Scopes
            </div>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                <ScopeBadge access="read" />{" "}
                <span className="text-foreground">read</span> — read-only tools ({readCount}).
              </li>
              <li>
                <ScopeBadge access="write_user" />{" "}
                <span className="text-foreground">manage</span> — read + writes to your own
                watchlists, portfolios &amp; holdings ({manageCount}).
              </li>
              <li>
                <ScopeBadge access="write_other" />{" "}
                <span className="text-foreground">full</span> — everything, including enrichment (
                {fullCount}).
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Full per-parameter reference and client snippets:{" "}
            <Link href="/mcp" className="text-primary hover:text-primary/80 underline">
              /mcp
            </Link>{" "}
            · step-by-step{" "}
            <Link href="/settings/mcp/guide" className="text-primary hover:text-primary/80 underline">
              connection guide
            </Link>
            .
          </p>
        </div>
      </div>

      {/* ── Tools ──────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Tools <span className="text-muted-foreground font-normal">({TOOL_CATALOG.length})</span>
        </h3>
        <span className="text-[10px] text-muted-foreground">badge = minimum scope</span>
      </div>

      {grouped.map(({ group, tools }) => (
        <div key={group} className="card">
          <div className="card-header flex items-center justify-between">
            <span className="card-title">{group}</span>
            <span className="text-[10px] text-muted-foreground">{tools.length}</span>
          </div>
          <div className="divide-y divide-border/40">
            {tools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
