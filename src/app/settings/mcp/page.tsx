import { redirect } from "next/navigation";

export default function McpIndex() {
  redirect("/settings/mcp/tokens");
}
