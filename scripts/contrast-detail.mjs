import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("https://fin.vibelife.sg/ranked", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
const counts = {};
for (const v of results.violations.filter(v => v.id === "color-contrast")) {
  for (const n of v.nodes) {
    const msg = n.any[0]?.message ?? "";
    const m = msg.match(/contrast of ([\d.]+).*foreground color: (#\w+).*background color: (#\w+)/);
    const key = m ? `${m[2]} on ${m[3]} (${m[1]}:1)` : msg.slice(0, 80);
    counts[key] = (counts[key] || 0) + 1;
  }
}
for (const [k, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(c, "×", k);
await browser.close();
