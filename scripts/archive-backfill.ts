/**
 * Archive backfill spike — DRY RUN ONLY.
 *
 * Finds listings whose newest recorded observation predates a cutoff (default
 * 2025-01-01), asks the Wayback Machine CDX API for captures of the retailer
 * listing URL, then reads `offers.price` out of each snapshot's JSON-LD.
 *
 *   npx tsx scripts/archive-backfill.ts --dry-run --limit 50
 *
 * Rules enforced here:
 *   • no production writes of any kind (the script never calls ensureSchema,
 *     insert, update or delete; a run without --dry-run is refused);
 *   • at most one outbound request per second, including robots.txt and CDX;
 *   • the retailer's own robots.txt is checked before a listing is queried;
 *   • snapshots are fetched through `id_` so we read the archived bytes as-is;
 *   • every price written to the report is a number parsed from that snapshot,
 *     with its capture timestamp. Nothing is inferred or carried forward.
 *
 * `--smoke N` is a pipeline check only: it picks N listings regardless of age
 * and marks them as excluded from the hit rate. The default selection is the
 * strict one described above.
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db/client";
import { listings, observations } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

const UA = "DealSenseArchiveBackfill/1.0 (+https://dealsense-fawn.vercel.app)";
const MIN_INTERVAL_MS = 1000;
const CUTOFF_DEFAULT = "2025-01-01";

let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url: string, accept: string): Promise<Response | null> {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCall));
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* robots.txt                                                          */
/* ------------------------------------------------------------------ */

interface Robots {
  status: "allowed" | "blocked" | "unavailable";
  reason: string;
}

const robotsCache = new Map<string, Robots>();

/** Longest-match robots rule with `*` and `$` support for the `*` group. */
function robotsAllows(text: string, path: string): boolean {
  const lines = text.split(/\r?\n/);
  let inStar = false;
  const rules: { allow: boolean; pattern: string }[] = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStar = value === "*";
      continue;
    }
    if (!inStar) continue;
    if (key === "allow") rules.push({ allow: true, pattern: value });
    if (key === "disallow" && value) rules.push({ allow: false, pattern: value });
  }
  const toRe = (p: string) => {
    const end = p.endsWith("$");
    const body = end ? p.slice(0, -1) : p;
    const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}${end ? "$" : ""}`);
  };
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const pattern = r.pattern.startsWith("/") ? r.pattern : `/${r.pattern}`;
    if (!toRe(pattern).test(path)) continue;
    if (!best || pattern.length > best.len) best = { allow: r.allow, len: pattern.length };
  }
  return best ? best.allow : true;
}

async function checkRobots(host: string, path: string): Promise<Robots> {
  const cached = robotsCache.get(host);
  if (cached) return cached;
  const res = await politeFetch(`https://${host}/robots.txt`, "text/plain");
  let verdict: Robots;
  if (!res) {
    verdict = { status: "unavailable", reason: "robots.txt could not be fetched" };
  } else if (res.status === 404 || res.status === 410) {
    verdict = { status: "allowed", reason: "robots.txt not published (404) — treated as allow" };
  } else if (!res.ok) {
    verdict = { status: "unavailable", reason: `robots.txt HTTP ${res.status}` };
  } else {
    const text = await res.text();
    verdict = robotsAllows(text, path)
      ? { status: "allowed", reason: "path not disallowed" }
      : { status: "blocked", reason: "retailer robots.txt disallows this path" };
  }
  robotsCache.set(host, verdict);
  return verdict;
}

/* ------------------------------------------------------------------ */
/* Wayback CDX                                                         */
/* ------------------------------------------------------------------ */

interface Capture {
  timestamp: string;
  original: string;
}

async function cdxCaptures(url: string): Promise<{ captures: Capture[]; error?: string }> {
  // Query strings on retailer URLs are tracking noise and usually have no
  // captures of their own, so fall back to the clean path before giving up.
  const candidates = [url];
  try {
    const clean = new URL(url);
    if (clean.search || clean.hash) {
      clean.search = "";
      clean.hash = "";
      candidates.push(clean.toString());
    }
  } catch {
    /* selection already rejected non-absolute URLs */
  }

  for (const candidate of candidates) {
    const params = new URLSearchParams({
      url: candidate,
      output: "json",
      fl: "timestamp,original,statuscode,mimetype",
      collapse: "digest",
      limit: "40",
    });
    const cdx =
      "https://web.archive.org/cdx/search/cdx?" +
      params.toString() +
      "&filter=statuscode:200&filter=mimetype:text/html";
    const res = await politeFetch(cdx, "application/json");
    if (!res) return { captures: [], error: "CDX request failed" };
    if (res.status === 429) return { captures: [], error: "CDX rate limited (429)" };
    if (!res.ok) return { captures: [], error: `CDX HTTP ${res.status}` };
    try {
      const rows = (await res.json()) as string[][];
      if (!Array.isArray(rows) || rows.length < 2) continue;
      const header = rows[0];
      const tsIdx = header.indexOf("timestamp");
      const origIdx = header.indexOf("original");
      const mimeIdx = header.indexOf("mimetype");
      const out: Capture[] = [];
      for (const row of rows.slice(1)) {
        if (mimeIdx !== -1 && !String(row[mimeIdx] ?? "").includes("html")) continue;
        out.push({ timestamp: String(row[tsIdx]), original: String(row[origIdx]) });
      }
      if (out.length) return { captures: out };
    } catch (err) {
      return { captures: [], error: `CDX parse error: ${(err as Error).message}` };
    }
  }
  return { captures: [] };
}

/** Spread the sample across the capture list instead of taking one cluster. */
function pickSnapshots(captures: Capture[], max: number): Capture[] {
  if (captures.length <= max) return captures;
  const out: Capture[] = [];
  for (let i = 0; i < max; i++) {
    out.push(captures[Math.floor((i * (captures.length - 1)) / Math.max(1, max - 1))]);
  }
  return [...new Map(out.map((c) => [c.timestamp, c])).values()];
}

/* ------------------------------------------------------------------ */
/* JSON-LD price extraction                                            */
/* ------------------------------------------------------------------ */

interface PriceHit {
  price: number;
  currency: string | null;
  availability: string | null;
  productName: string | null;
  sku: string | null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function walkJsonLd(node: unknown, out: PriceHit[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = String(obj["@type"] ?? "");
  if (obj.offers && (type.includes("Product") || type === "")) {
    const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;
      const o = offer as Record<string, unknown>;
      const price =
        toNumber(o.price) ??
        toNumber(o.lowPrice) ??
        toNumber((o.priceSpecification as Record<string, unknown> | undefined)?.price);
      if (price === null || price <= 0 || price > 10_000_000) continue;
      out.push({
        price,
        currency: typeof o.priceCurrency === "string" ? o.priceCurrency : null,
        availability: typeof o.availability === "string" ? o.availability : null,
        productName: typeof obj.name === "string" ? obj.name : null,
        sku: typeof obj.sku === "string" ? obj.sku : null,
      });
    }
  }
  for (const value of Object.values(obj)) walkJsonLd(value, out);
}

function extractJsonLdPrices(html: string): PriceHit[] {
  const out: PriceHit[] = [];
  const re =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]
      .replace(/^\s*\/\/\s*<!\[CDATA\[\s*/, "")
      .replace(/\s*\/\/\s*\]\]>\s*$/, "")
      .trim();
    if (!raw) continue;
    try {
      walkJsonLd(JSON.parse(raw), out);
    } catch {
      /* not valid JSON-LD — ignore, do not guess */
    }
  }
  // One price per distinct value keeps the sample readable.
  return out.filter(
    (hit, i) => out.findIndex((h) => h.price === hit.price && h.sku === hit.sku) === i,
  );
}

function snapshotDate(timestamp: string): string {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

interface Candidate {
  id: string;
  merchant: string;
  url: string;
  title: string | null;
  newest: number;
  points: number;
  smoke?: boolean;
}

async function selectStrict(cutoffMs: number, limit: number): Promise<Candidate[]> {
  const rows = await db.all(sql`
    SELECT l.id AS id, l.merchant AS merchant, l.url AS url, l.title AS title,
           MAX(o.observed_at) AS newest, COUNT(o.id) AS points
    FROM listings l
    JOIN observations o ON o.listing_id = l.id
    GROUP BY l.id
    HAVING MAX(o.observed_at) < ${cutoffMs}
    ORDER BY MAX(o.observed_at) ASC
    LIMIT ${limit}
  `);
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    merchant: String(r.merchant),
    url: String(r.url),
    title: (r.title as string) ?? null,
    newest: Number(r.newest),
    points: Number(r.points),
  }));
}

/** Pipeline validation only; these are never counted in the hit rate. */
async function selectSmoke(count: number): Promise<Candidate[]> {
  const rows = (await db.all(sql`
    SELECT l.id AS id, l.merchant AS merchant, l.url AS url, l.title AS title,
           MAX(o.observed_at) AS newest, COUNT(o.id) AS points
    FROM listings l
    JOIN observations o ON o.listing_id = l.id
    GROUP BY l.id
    ORDER BY MAX(o.observed_at) ASC
    LIMIT ${count * 20}
  `)) as Record<string, unknown>[];
  const picked: Candidate[] = [];
  const hosts = new Set<string>();
  const add = (r: Record<string, unknown>) => {
    picked.push({
      id: String(r.id),
      merchant: String(r.merchant),
      url: String(r.url),
      title: (r.title as string) ?? null,
      newest: Number(r.newest),
      points: Number(r.points),
      smoke: true,
    });
  };
  // First pass: one per host, so every store's parser gets exercised.
  for (const r of rows) {
    let host = "";
    try {
      host = new URL(String(r.url)).hostname;
    } catch {
      continue;
    }
    if (hosts.has(host)) continue;
    hosts.add(host);
    add(r);
    if (picked.length >= count) return picked;
  }
  // Second pass: fill the rest, skipping ids already chosen.
  for (const r of rows) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.id === String(r.id))) continue;
    add(r);
  }
  return picked;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

interface ListingResult {
  id: string;
  merchant: string;
  url: string;
  title: string | null;
  newestObservation: string | null;
  points: number;
  smoke: boolean;
  robots: Robots;
  snapshotsFound: number;
  snapshotsTried: number;
  snapshotsParsed: number;
  prices: {
    snapshot: string;
    date: string;
    price: number;
    currency: string | null;
    availability: string | null;
    productName: string | null;
  }[];
  errors: string[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.argv.includes("--dry-run")) {
    console.error(
      "refusing to run: this spike is dry-run only. Pass --dry-run (no production writes exist in this script).",
    );
    process.exit(1);
  }

  const limit = Math.max(1, Math.min(500, Number(arg("--limit") ?? 50) || 50));
  const before = arg("--before") ?? CUTOFF_DEFAULT;
  const cutoffMs = Date.parse(`${before}T00:00:00Z`);
  if (!Number.isFinite(cutoffMs)) {
    console.error(`bad --before date: ${before}`);
    process.exit(1);
  }
  const snapshotsPerListing = Math.max(1, Math.min(10, Number(arg("--snapshots") ?? 4) || 4));
  const smokeCount = Number(arg("--smoke") ?? 0) || 0;

  const strict = await selectStrict(cutoffMs, limit);
  const smoke = smokeCount > 0 ? await selectSmoke(smokeCount) : [];
  const selected = [...strict, ...smoke];

  const diagnosis = (await db.all(sql`
    SELECT
      (SELECT COUNT(*) FROM listings) AS totalListings,
      (SELECT COUNT(DISTINCT listing_id) FROM observations) AS listingsWithPoints,
      (SELECT COUNT(DISTINCT listing_id) FROM observations WHERE observed_at < ${cutoffMs}) AS listingsWithOldPoints
  `))[0] as Record<string, unknown>;
  const diag = {
    totalListings: Number(diagnosis.totalListings),
    listingsWithPoints: Number(diagnosis.listingsWithPoints),
    listingsWithAnyObservationBeforeCutoff: Number(diagnosis.listingsWithOldPoints),
  };

  console.log(
    `dry-run · cutoff ${before} · eligible listings ${strict.length} · smoke ${smoke.length} · snapshots/listing ${snapshotsPerListing}`,
  );
  if (!selected.length) {
    console.log("no eligible listings — nothing to query. Report will record zero eligible.");
  }

  const results: ListingResult[] = [];
  for (const listing of selected) {
    console.log(`\n${listing.smoke ? "[smoke] " : ""}${listing.merchant} ${listing.id}`);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(listing.url);
    } catch {
      results.push({
        id: listing.id,
        merchant: listing.merchant,
        url: listing.url,
        title: listing.title,
        newestObservation: listing.newest ? new Date(listing.newest).toISOString() : null,
        points: listing.points,
        smoke: !!listing.smoke,
        robots: { status: "unavailable", reason: "listing URL is not absolute" },
        snapshotsFound: 0,
        snapshotsTried: 0,
        snapshotsParsed: 0,
        prices: [],
        errors: ["listing URL is not absolute"],
      });
      continue;
    }

    const robots = await checkRobots(parsedUrl.hostname, parsedUrl.pathname + parsedUrl.search);
    if (robots.status !== "allowed") {
      console.log(`  skipped — ${robots.reason}`);
      results.push({
        id: listing.id,
        merchant: listing.merchant,
        url: listing.url,
        title: listing.title,
        newestObservation: listing.newest ? new Date(listing.newest).toISOString() : null,
        points: listing.points,
        smoke: !!listing.smoke,
        robots,
        snapshotsFound: 0,
        snapshotsTried: 0,
        snapshotsParsed: 0,
        prices: [],
        errors: [robots.reason],
      });
      continue;
    }

    const { captures, error } = await cdxCaptures(listing.url);
    const picks = pickSnapshots(captures, snapshotsPerListing);
    const row: ListingResult = {
      id: listing.id,
      merchant: listing.merchant,
      url: listing.url,
      title: listing.title,
      newestObservation: listing.newest ? new Date(listing.newest).toISOString() : null,
      points: listing.points,
      smoke: !!listing.smoke,
      robots,
      snapshotsFound: captures.length,
      snapshotsTried: 0,
      snapshotsParsed: 0,
      prices: [],
      errors: error ? [error] : [],
    };

    for (const cap of picks) {
      const snapUrl = `https://web.archive.org/web/${cap.timestamp}id_/${cap.original}`;
      const res = await politeFetch(snapUrl, "text/html");
      row.snapshotsTried++;
      if (!res) {
        row.errors.push(`${cap.timestamp}: snapshot fetch failed`);
        continue;
      }
      if (!res.ok) {
        row.errors.push(`${cap.timestamp}: snapshot HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const hits = extractJsonLdPrices(html);
      if (!hits.length) {
        row.errors.push(`${cap.timestamp}: no JSON-LD offers.price`);
        continue;
      }
      row.snapshotsParsed++;
      for (const hit of hits.slice(0, 3)) {
        row.prices.push({
          snapshot: cap.timestamp,
          date: snapshotDate(cap.timestamp),
          price: hit.price,
          currency: hit.currency,
          availability: hit.availability,
          productName: hit.productName,
        });
      }
      console.log(
        `  ${cap.timestamp} → ${hits
          .slice(0, 2)
          .map((h) => `${h.currency ?? ""}${h.price}`)
          .join(", ")}`,
      );
    }
    results.push(row);
  }

  const strictRows = results.filter((r) => !r.smoke);
  const withSnapshots = strictRows.filter((r) => r.snapshotsFound > 0).length;
  const withPrice = strictRows.filter((r) => r.snapshotsParsed > 0).length;
  const tried = strictRows.reduce((n, r) => n + r.snapshotsTried, 0);
  const parsed = strictRows.reduce((n, r) => n + r.snapshotsParsed, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    productionWrites: 0,
    cutoff: before,
    limit,
    snapshotsPerListing,
    selection: {
      eligible: strict.length,
      smoke: smoke.length,
      diagnosis: diag,
      note:
        strict.length === 0
          ? `no listing has a newest observation before ${before}; the strict hit rate is undefined`
          : undefined,
    },
    requests: {
      policy: "max 1 request/second to any host",
      cdxQueries: selected.length,
      snapshotsFetched: tried,
    },
    totals: {
      listingsQueried: strictRows.length,
      listingsWithSnapshots: withSnapshots,
      listingsWithParsedPrice: withPrice,
      snapshotHitRate: strictRows.length ? +(withPrice / strictRows.length).toFixed(4) : null,
      snapshotsTried: tried,
      snapshotsParsed: parsed,
      snapshotParseRate: tried ? +(parsed / tried).toFixed(4) : null,
    },
    smokeTotals: {
      listingsQueried: results.filter((r) => r.smoke).length,
      listingsWithSnapshots: results.filter((r) => r.smoke && r.snapshotsFound > 0).length,
      listingsWithParsedPrice: results.filter((r) => r.smoke && r.snapshotsParsed > 0).length,
      snapshotsTried: results.filter((r) => r.smoke).reduce((n, r) => n + r.snapshotsTried, 0),
      snapshotsParsed: results.filter((r) => r.smoke).reduce((n, r) => n + r.snapshotsParsed, 0),
    },
    listings: results,
    samples: results.filter((r) => r.prices.length).slice(0, 3),
  };

  const date = new Date().toISOString().slice(0, 10);
  const dir = join(process.cwd(), "reports");
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, `archive-backfill-${date}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const md: string[] = [];
  md.push(`# Archive backfill spike — ${date}`);
  md.push("");
  md.push(`Dry run only. Production writes: **0**. Cutoff: **${before}**.`);
  md.push("");
  md.push("## Selection");
  md.push("");
  md.push(`- Eligible listings (newest observation before ${before}): **${strict.length}**`);
  md.push(
    `- Catalogue: ${diag.totalListings} listings, ${diag.listingsWithPoints} with observations, ${diag.listingsWithAnyObservationBeforeCutoff} with at least one observation older than the cutoff`,
  );
  if (smoke.length) md.push(`- Smoke-test listings (excluded from hit rate): **${smoke.length}**`);
  if (strict.length === 0) {
    md.push("");
    md.push(
      `No listing in the catalogue has a newest observation older than ${before}, so the requested 50-listing backfill has an empty selection. The hit rate is therefore not defined; nothing was substituted.`,
    );
  }
  md.push("");
  md.push("## Results");
  md.push("");
  md.push("| metric | value |");
  md.push("| --- | --- |");
  md.push(`| listings queried | ${strictRows.length} |`);
  md.push(`| listings with captures | ${withSnapshots} |`);
  md.push(`| listings with a parsed offers.price | ${withPrice} |`);
  md.push(`| listing hit rate | ${report.totals.snapshotHitRate ?? "n/a"} |`);
  md.push(`| snapshots tried / parsed | ${tried} / ${parsed} |`);
  md.push(`| snapshot parse rate | ${report.totals.snapshotParseRate ?? "n/a"} |`);
  md.push("");
  if (smoke.length) {
    md.push("### Smoke test (pipeline validation, not part of the hit rate)");
    md.push("");
    md.push("| listing | merchant | captures | tried | parsed | dates |");
    md.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of results.filter((x) => x.smoke)) {
      md.push(
        `| ${r.id} | ${r.merchant} | ${r.snapshotsFound} | ${r.snapshotsTried} | ${r.snapshotsParsed} | ${
          r.prices.map((p) => p.date).join(", ") || "—"
        } |`,
      );
    }
    md.push("");
  }
  md.push("## Samples");
  md.push("");
  if (!report.samples.length) {
    md.push("No parsed samples in this run.");
  } else {
    for (const r of report.samples) {
      md.push(`### ${r.merchant} — ${r.id}`);
      md.push("");
      md.push(`- ${r.url}`);
      md.push(`- captures found: ${r.snapshotsFound}; snapshots parsed: ${r.snapshotsParsed}`);
      for (const p of r.prices.slice(0, 4)) {
        md.push(
          `- ${p.date} (${p.snapshot}): ${p.currency ?? ""}${p.price} — ${p.productName ?? "unnamed"} — ${p.availability ?? "availability unknown"}`,
        );
      }
      md.push("");
    }
  }
  md.push("## Per-listing detail");
  md.push("");
  for (const r of results) {
    md.push(
      `- ${r.smoke ? "[smoke] " : ""}${r.merchant} ${r.id}: captures ${r.snapshotsFound}, tried ${r.snapshotsTried}, parsed ${r.snapshotsParsed}${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`,
    );
  }
  md.push("");
  const mdPath = join(dir, `archive-backfill-${date}.md`);
  writeFileSync(mdPath, `${md.join("\n")}\n`);

  console.log(`\nwrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
  process.exit(0);
}

main();
