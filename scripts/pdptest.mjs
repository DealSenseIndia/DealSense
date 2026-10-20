import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(base + "/", { waitUntil: "networkidle" });
const links = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href^="/product/"]')].map((a) => a.getAttribute("href")))],
);

const bad = [];
for (const href of links) {
  const res = await page.goto(base + href, { waitUntil: "domcontentloaded" }).catch(() => null);
  const status = res ? res.status() : 0;
  if (status >= 400) bad.push({ href, status });
}
console.log("checked", links.length, "product links");
console.log("broken:", bad.length);
for (const b of bad.slice(0, 10)) console.log("  ", b.status, b.href);

await browser.close();
