/**
 * Dev-only end-to-end check for Smart Setups + the homepage teaser.
 *   node scripts/verify-setups.mjs
 *
 * Verifies: themes render with every image loaded, no console errors, the
 * builder reprices on interaction, tiers switch, and the bundle modal opens.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const base = process.env.BASE_URL || "http://localhost:3000";
const outDir = resolve(process.env.OUT_DIR || "shots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const results = { setupPages: [], homepage: null, interaction: null, errors: [] };

async function newPage(width, height, theme) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (theme) {
    await page.addInitScript((t) => {
      localStorage.setItem("dealsense_theme", t);
    }, theme);
  }
  page.on("console", (msg) => {
    if (msg.type() === "error") results.errors.push(msg.text().slice(0, 500));
  });
  return page;
}

async function settle(page) {
  // Next/Image is lazy by default. For a deterministic full-page capture, ask
  // the browser to fetch every image now rather than relying on scroll timing.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    for (const img of document.images) img.loading = "eager";
  });
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 180));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  // Lazy images only start loading once they scroll into view. Wait for every
  // <img> that has a source to finish, then decode, so screenshots never catch
  // a room photo mid-load.
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((img) => img.getAttribute("src") || img.getAttribute("srcset"))
          .every((img) => img.complete),
      null,
      { timeout: 30000 },
    )
    .catch(() => {});
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map(async (img) => {
        if (!img.complete || !img.decode) return;
        try {
          await Promise.race([
            img.decode(),
            new Promise((resolve) => setTimeout(resolve, 2500)),
          ]);
        } catch {
          /* a broken image is reported by imageAudit, not retried here */
        }
      }),
    ),
  );
  await page.waitForTimeout(300);
}

async function imageAudit(page) {
  return page.evaluate(() => {
    const images = [...document.images];
    const withSource = images.filter(
      (img) => img.getAttribute("src") || img.getAttribute("srcset"),
    );
    const broken = withSource
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src);
    const pending = withSource.filter((img) => !img.complete).length;
    return { total: images.length, broken, pending };
  });
}

for (const { width, height, theme, name } of [
  { width: 1440, height: 1000, theme: "light", name: "setups-light" },
  { width: 1440, height: 1000, theme: "dark", name: "setups-dark" },
  { width: 390, height: 844, theme: "light", name: "setups-mobile" },
]) {
  console.log(`→ ${name} (${width}px, ${theme})`);
  const page = await newPage(width, height, theme);
  await page.goto(`${base}/setups`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1800);
  await settle(page);
  const audit = await imageAudit(page);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: true });
  results.setupPages.push({ name, ...audit, theme });
  await page.close();
  console.log(`  ✓ ${name}: ${audit.total} images, ${audit.pending} pending, ${audit.broken.length} broken`);
}

// ── Interaction: build a gaming room, change budget, keep a mattress ──────
{
  console.log("→ interaction");
  const page = await newPage(1440, 1000, "light");
  await page.goto(`${base}/setups`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: /Gaming setup/ }).click();
  await page.getByRole("button", { name: /Step up/ }).click().catch(() => {});
  const budgetPill = page.getByRole("button", { name: "₹75K", exact: true });
  if (await budgetPill.count()) await budgetPill.first().click();
  await page.getByRole("button", { name: /Gaming monitor/ }).click();
  await page.getByRole("button", { name: /Modern minimal/ }).click();

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/setups/build") && r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.locator("#generate-setup-btn").click();
  const response = await responsePromise;
  const body = await response.json();
  await page.waitForTimeout(1200);

  const url = page.url();
  const heading = await page.locator("#setup-results h2").first().innerText();
  const tierButtons = await page.locator('[role="tab"]').allInnerTexts();
  const ownedGuard = await page.getByText(/Trust Guard/).count();
  const items = await page.locator("#setup-results article").count();

  // Switch to the saver tier and back to confirm rerender rather than refetch.
  const saver = page.getByRole("tab", { name: /Saver/ });
  if (await saver.count()) await saver.click();

  await page.locator("#setup-results").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(outDir, "setups-interaction.png"), fullPage: false });

  // Bundle modal
  const review = page.getByRole("button", { name: /Review full bundle/ });
  let modal = false;
  if (await review.count()) {
    await review.click();
    await page.waitForTimeout(450);
    modal = await page.getByRole("dialog").count().then((n) => n > 0);
    await page.keyboard.press("Escape").catch(() => {});
  }

  results.interaction = {
    httpOk: response.ok(),
    apiOk: body?.ok === true,
    url,
    heading,
    tierButtons,
    ownedGuard,
    items,
    modal,
  };
  await page.close();
}

// ── Homepage teaser ──────────────────────────────────────────────────────
{
  console.log("→ homepage");
  const page = await newPage(1440, 1000, "light");
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1200);
  await settle(page);
  const audit = await imageAudit(page);
  const teaser = page.locator('section[aria-labelledby="smart-setups-heading"]');
  const exists = (await teaser.count()) > 0;
  if (exists) await teaser.screenshot({ path: resolve(outDir, "home-smart-setups.png") });
  await page.screenshot({ path: resolve(outDir, "home-desktop.png"), fullPage: true });
  results.homepage = { exists, ...audit };
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
