// One-off axe-core WCAG 2.1 AA audit over the deployed public pages.
// Usage: node scripts/a11y-audit.mjs [baseUrl]
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.argv[2] ?? "https://fin.vibelife.sg";
const pages = ["/", "/options", "/ranked", "/stock/AAPL", "/stock/AAPL?tab=options"];

const browser = await chromium.launch();
const ctx = await browser.newContext();
let totalViolations = 0;

for (const path of pages) {
  const page = await ctx.newPage();
  try {
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500); // let react-query panels settle
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("iframe") // third-party TradingView ticker tape — not ours to fix
      .analyze();
    console.log(`\n=== ${path} — ${results.violations.length} violation types ===`);
    for (const v of results.violations) {
      totalViolations += v.nodes.length;
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
      for (const n of v.nodes.slice(0, 3)) {
        console.log(`     → ${n.target.join(" ")}`.slice(0, 160));
      }
    }
  } catch (e) {
    console.log(`\n=== ${path} — AUDIT FAILED: ${e.message.slice(0, 120)}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(`\nTOTAL violating nodes: ${totalViolations}`);
