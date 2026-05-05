import { McpSubnav } from "@/components/settings/McpSubnav";

export default function McpSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">
        MCP &amp; connections
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Personal access tokens, OAuth-connected apps, and how to wire up an
        MCP client.
      </p>
      <McpSubnav />
      {children}
    </div>
  );
}
