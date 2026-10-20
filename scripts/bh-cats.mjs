import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});
const page = await ctx.newPage();

const dumpLinks = async (url, label) => {
  console.log(`\n\n########## ${label} :: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  } catch (e) {
    console.log("  load failed:", String(e).slice(0, 90));
    return;
  }
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const res = [];
    for (const a of document.querySelectorAll("a[href], button, label")) {
      const t = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (t && t.length < 44) res.push(t);
    }
    return [...new Set(res)];
  });
  console.log(out.join(" | "));
};

await dumpLinks("https://buyhatke.com/deals", "BUYHATKE DEALS");
await dumpLinks("https://buyhatke.com/supported-stores", "BUYHATKE STORES");
await dumpLinks("https://pricehistory.ai/", "PRICEHISTORY.AI HOME");
await dumpLinks("https://pricehistory.ai/categories", "PRICEHISTORY.AI CATEGORIES");

await browser.close();
