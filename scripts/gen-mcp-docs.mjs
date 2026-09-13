#!/usr/bin/env node
/**
 * Regenerate the "## Tools" section of docs/mcp.md from src/lib/mcp/catalog.ts,
 * so the markdown cannot drift from the registry that drives the server and
 * the /mcp page. Everything outside that section is preserved.
 *
 *   node scripts/gen-mcp-docs.mjs          # rewrite docs/mcp.md
 *   node scripts/gen-mcp-docs.mjs --check  # exit 1 if docs/mcp.md is stale
 *
 * Runs before `next build` in --check mode. The catalog is plain TypeScript
 * with no imports, so Node loads it directly (type stripping).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(here, "../docs/mcp.md");
const { TOOL_CATALOG, toolAccess } = await import(resolve(here, "../src/lib/mcp/catalog.ts"));

const GROUP_ORDER = [
  "Profile", "Watchlists", "Portfolios", "Holdings", "Sales", "Market data",
  "Options", "News & sentiment", "AI", "Today", "Quant", "Desk", "Journal",
];
const ACCESS_LABEL = { read: "read", write_user: "manage", write_other: "full (admin)" };

function render() {
  const lines = [
    "## Tools",
    "",
    "The full, always-current tool reference is rendered at",
    "[`/mcp`](https://fin.vibelife.sg/mcp) (no login required). The list below is",
    "generated from `src/lib/mcp/catalog.ts` by `scripts/gen-mcp-docs.mjs`; the",
    "build fails if it is stale. *Scope* is the least token scope that can call",
    "the tool: `read` < `manage` < `full`.",
    "",
  ];
  const groups = [...GROUP_ORDER, ...[...new Set(TOOL_CATALOG.map((t) => t.group))].filter((g) => !GROUP_ORDER.includes(g))];
  for (const group of groups) {
    const tools = TOOL_CATALOG.filter((t) => t.group === group);
    if (!tools.length) continue;
    lines.push(`### ${group}`, "", "| Tool | Scope | Description | Parameters |", "|---|---|---|---|");
    for (const t of tools) {
      const params = t.params.length
        ? t.params.map((p) => `\`${p.name}\`${p.required ? "" : "?"}: ${p.type}`).join(", ")
        : "—";
      lines.push(`| \`${t.name}\` | ${ACCESS_LABEL[toolAccess(t.name)]} | ${t.description.replace(/\|/g, "\\|")} | ${params.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const doc = readFileSync(docPath, "utf8");
const start = doc.indexOf("## Tools");
const end = doc.indexOf("## Implementation notes");
if (start < 0 || end < 0 || end < start) {
  console.error("gen-mcp-docs: could not find the '## Tools' … '## Implementation notes' span in docs/mcp.md");
  process.exit(2);
}
const next = doc.slice(0, start) + render() + doc.slice(end);

if (process.argv.includes("--check")) {
  if (next !== doc) {
    console.error("gen-mcp-docs: docs/mcp.md is stale — run `node scripts/gen-mcp-docs.mjs`");
    process.exit(1);
  }
  console.log(`gen-mcp-docs: docs/mcp.md matches the catalog (${TOOL_CATALOG.length} tools)`);
} else {
  writeFileSync(docPath, next);
  console.log(`gen-mcp-docs: wrote docs/mcp.md (${TOOL_CATALOG.length} tools)`);
}
