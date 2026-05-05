import { McpTokensCard } from "@/components/settings/McpTokensCard";
import { McpOauthGrantsCard } from "@/components/settings/McpOauthGrantsCard";
import { RegisterMcpClientCard } from "@/components/settings/RegisterMcpClientCard";
import { McpConnectionGuide } from "@/components/settings/McpConnectionGuide";

export const metadata = { title: "MCP & connections · vibefin" };

export default function McpSettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">
        MCP &amp; connections
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Personal access tokens, OAuth-connected apps, and how to wire up an
        MCP client.
      </p>
      <McpTokensCard />
      <McpOauthGrantsCard />
      <McpConnectionGuide />
      <RegisterMcpClientCard />
    </div>
  );
}
