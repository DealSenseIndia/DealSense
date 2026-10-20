/**
 * Full-bleed full-page capture.
 *   node scripts/capture.mjs <path> <out.png> [width]
 *
 * The viewport is widened past the page content and the scrollbar is hidden,
 * so the capture runs edge to edge with no gutter on the left or right.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , path = "/", out = "capture.png", w = "1440"] = process.argv;

const base = process.env.BASE_URL || "http://localhost:3000";
const target = path.startsWith("http") ? path : base + path;
const outPath = resolve(out);
mkdirSync(dirname(outPath), { recursive: true });

const width = Number(w);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });

// Hide the scrollbar so nothing eats a stripe on the right.
await page.addStyleTag({ content: "html{scrollbar-width:none}::-webkit-scrollbar{display:none}" });

// Walk the page so every lazy image and animation settles.
await page.evaluate(async () => {
  const step = Math.round(window.innerHeight * 0.7);
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 180));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 500));
});
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(1200);

const size = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  scrollH: document.documentElement.scrollHeight,
  bodyW: document.body.getBoundingClientRect().width,
}));

await page.screenshot({ path: outPath, fullPage: true, animations: "disabled" });
await browser.close();

console.log(
  JSON.stringify(
    { target, out: outPath, ...size, gutter: size.scrollW - size.clientW },
    null,
    2,
  ),
);
