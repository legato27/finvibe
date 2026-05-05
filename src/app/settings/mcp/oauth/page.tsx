import { McpOauthGrantsCard } from "@/components/settings/McpOauthGrantsCard";
import { RegisterMcpClientCard } from "@/components/settings/RegisterMcpClientCard";

export const metadata = { title: "Connected apps · MCP · vibefin" };

export default function McpOauthPage() {
  return (
    <>
      <McpOauthGrantsCard />
      <RegisterMcpClientCard />
    </>
  );
}
