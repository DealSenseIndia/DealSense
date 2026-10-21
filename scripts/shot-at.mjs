import { chromium } from "playwright";

const path = process.argv[2] || "/";
const out = process.argv[3] || "shot.png";
const w = Number(process.argv[4] || 1440);
const h = Number(process.argv[5] || 900);
const scrollTo = Number(process.argv[6] || 0);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.goto("http://localhost:3000" + path, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await page.screenshot({ path: out });
console.log("ok", out);
await browser.close();
