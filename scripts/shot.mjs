/**
 * Dev-only visual check helper.
 *   node scripts/shot.mjs <path> <out.png> [width] [height] [full]
 * Example: node scripts/shot.mjs / shot-home.png 1440 900
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , path = "/", out = "shot.png", w = "1440", h = "900", full = ""] = process.argv;

const base = process.env.BASE_URL || "http://localhost:3000";
const target = path.startsWith("http") ? path : base + path;
const outPath = resolve(out);
mkdirSync(dirname(outPath), { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 1,
});
await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(1200);

// Wait for React to hydrate so live components (countdowns) have mounted.
await page
  .waitForFunction(() => document.querySelectorAll("[data-hydrated]").length >= 0, null, {
    timeout: 5000,
  })
  .catch(() => {});
await page.waitForTimeout(1200);

// Scroll the whole page so lazy-loaded images actually fetch before capture.
await page.evaluate(async () => {
  const step = Math.round(window.innerHeight * 0.8);
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 140));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
});
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(800);

const overflow = await page.evaluate(() => {
  const vw = window.innerWidth;
  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      p = p.parentElement;
    }
    return false;
  };
  const bad = [...document.querySelectorAll("*")]
    .filter((e) => e.getBoundingClientRect().width > 0)
    .filter((e) => e.getBoundingClientRect().right > vw + 1)
    .filter((e) => !inScroller(e))
    .slice(0, 10)
    .map((e) => ({
      tag: e.tagName,
      cls: String(e.className).slice(0, 80),
      right: Math.round(e.getBoundingClientRect().right),
    }));
  return { vw, scrollW: document.documentElement.scrollWidth, bad };
});

await page.screenshot({ path: outPath, fullPage: full === "full" });
await browser.close();

console.log(JSON.stringify({ target, out: outPath, ...overflow }, null, 2));
