/**
 * Debug helper: show exactly which tracked listings match a setup slot.
 *
 *   npx tsx scripts/setups-inspect.ts bedroom
 *   npx tsx scripts/setups-inspect.ts kitchen storage
 */
import "./env";
import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { listings, observations, products } from "../src/lib/db/schema";
import { SETUP_SPACES } from "../src/lib/setups/blueprints";
import { computeStats } from "../src/lib/engine/stats";
import { evaluateDeal } from "../src/lib/engine/verdict";

function tokenInText(token: string, text: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return false;
  if (t.includes(" ") || t.length > 5) return text.includes(t);
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s)?(?:[^a-z0-9]|$)`).test(text);
}

async function main() {
  const spaceArg = process.argv[2];
  const slotArg = process.argv[3];
  const space = spaceArg
    ? SETUP_SPACES[spaceArg as keyof typeof SETUP_SPACES]
    : undefined;
  const spaces = space ? [space] : Object.values(SETUP_SPACES);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      price: listings.price,
      mrp: listings.mrp,
      merchant: listings.merchant,
      inStock: listings.inStock,
      productTitle: products.title,
      brand: products.brand,
    })
    .from(listings)
    .innerJoin(products, eq(products.id, listings.productId))
    .where(
      and(
        inArray(listings.merchant, ["amazon", "flipkart"]),
        isNotNull(listings.price),
        gt(listings.price, 0),
      ),
    );

  const obsRows = await db
    .select({
      listingId: observations.listingId,
      price: observations.price,
      observedAt: observations.observedAt,
    })
    .from(observations)
    .where(inArray(observations.listingId, rows.map((r) => r.id)));

  const obsByListing = new Map<string, { price: number; observedAt: number }[]>();
  for (const o of obsRows) {
    if (o.price === null || o.price <= 0) continue;
    const list = obsByListing.get(o.listingId) ?? [];
    list.push({ price: o.price, observedAt: o.observedAt });
    obsByListing.set(o.listingId, list);
  }

  function deal(r: (typeof rows)[number]) {
    const obs = obsByListing.get(r.id) ?? [];
    const stats = computeStats(obs);
    const verdict = evaluateDeal({ current: r.price ?? 0, mrp: r.mrp, stats });
    return { verdict: verdict.verdict, score: verdict.score, reason: verdict.reasons[0] ?? "" };
  }

  // Raw grep mode: npx tsx scripts/setups-inspect.ts raw "coffee table"
  if (spaceArg === "raw") {
    const needle = (slotArg ?? "").toLowerCase();
    const hits = rows
      .filter((r) =>
        [r.title, r.productTitle, r.brand]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    console.log(`raw "${needle}": ${hits.length} listings`);
    for (const h of hits) {
      console.log(
        `  ₹${String(Math.round(h.price ?? 0)).padStart(7)} ${h.merchant.padEnd(8)} ${h.inStock === false ? "OOS" : "   "} ${h.id}  ${h.title?.slice(0, 110)}`,
      );
    }
    return;
  }

  for (const sp of spaces) {
    for (const slot of sp.slots) {
      if (slotArg && slot.key !== slotArg) continue;
      const withHay = rows.map((r) => ({
        ...r,
        hay: [r.title, r.productTitle, r.brand].filter(Boolean).join(" ").toLowerCase(),
      }));
      const matches = withHay
        .filter(
          (r) =>
            !slot.exclude.some((bad) => tokenInText(bad, r.hay)) &&
            slot.matchAny.some((good) => tokenInText(good, r.hay)),
        )
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

      console.log(`\n${sp.title} · ${slot.label}: ${matches.length} matches`);
      for (const m of matches) {
        const d = deal(m);
        console.log(
          `  ₹${String(Math.round(m.price ?? 0)).padStart(7)} ${d.verdict.padEnd(12)} ${String(d.score ?? "—").padStart(3)}  ${m.merchant.padEnd(8)} ${m.inStock === false ? "OOS " : "    "}${m.title?.slice(0, 70)}${d.verdict === "AVOID" ? `  [${d.reason}]` : ""}`,
        );
      }

      if (matches.length === 0 || process.env.WHY === "1") {
        const near = withHay
          .filter((r) => slot.matchAny.some((good) => tokenInText(good, r.hay)))
          .slice(0, 40);
        for (const n of near) {
          const hit = slot.exclude.filter((bad) => tokenInText(bad, n.hay));
          if (!hit.length) continue;
          console.log(
            `  [excluded by ${hit.join(", ")}] ₹${Math.round(n.price ?? 0)} ${n.title?.slice(0, 100)}`,
          );
        }
        if (!near.length) console.log("  (no title contains any matchAny token at all)");
      }
    }
  }
}

main().then(() => process.exit(0));
