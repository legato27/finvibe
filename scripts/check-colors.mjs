#!/usr/bin/env node
/**
 * The skin contract: colour is declared in exactly two files.
 *
 *   src/app/globals.css            every token, light and dark
 *   src/components/heatmap/palette.ts  reads tokens for charts at runtime
 *
 * Anything else that names a colour — a hex, hsl()/rgb(), or a raw Tailwind
 * palette class like `text-green-600` — fails this check, and the build.
 * Components use the semantic names from tailwind.config.ts instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const ALLOW = new Set(["src/app/globals.css", "src/components/heatmap/palette.ts"]);

const PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const RULES = [
  { name: "hex colour", re: /#[0-9a-fA-F]{3,8}\b(?![-\w])/g },
  { name: "hsl()/rgb()", re: /\b(?:hsla?|rgba?)\(/g },
  {
    name: "raw Tailwind palette class",
    re: new RegExp(
      `(?<![\\w-])(?:[a-z]+:)*(?:bg|text|border|from|to|via|ring|fill|stroke|outline|decoration|divide|shadow|accent|caret|placeholder)-${PALETTE}-\\d{2,3}(?:/\\d+)?\\b`,
      "g",
    ),
  },
  { name: "white/black literal", re: /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border|shadow|from|to|via|ring|fill|stroke)-(?:white|black)(?:\/[\d.\[\]]+)?\b/g },
  { name: "arbitrary colour value", re: /\b(?:bg|text|border|from|to|via|ring|fill|stroke)-\[(?:#|hsl|rgb)[^\]]*\]/g },
];

// `#` followed by hex inside an id selector / anchor is rare in tsx but
// legitimate; skip the two we know about.
const SKIP_LINE = /(?:href=|id=|querySelector|getElementById|url\(#|"#top"|'#top')/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|mjs|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOW.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (SKIP_LINE.test(line)) return;
    for (const { name, re } of RULES) {
      re.lastIndex = 0;
      const m = line.match(re);
      if (m) problems.push(`${rel}:${i + 1}  ${name}: ${[...new Set(m)].join(" ")}`);
    }
  });
}

if (problems.length) {
  console.error(`\nColour outside the skin (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
  console.error(
    "\nDeclare it as a token in src/app/globals.css and use the semantic Tailwind name, or read it through components/heatmap/palette.ts.\n",
  );
  process.exit(1);
}
console.log("check-colors: clean — colour lives only in globals.css and palette.ts");
