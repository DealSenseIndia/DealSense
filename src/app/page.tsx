import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Container } from "@/components/ui/Container";
import { Hero, type FeaturedDeal } from "@/components/landing/Hero";
import { CategoryPanel } from "@/components/landing/CategoryPanel";
import { LiveDeals } from "@/components/landing/LiveDeals";
import { SmartSetupsTeaser } from "@/components/landing/SmartSetupsTeaser";
import { AllTimeLows, DealsMovingNow, PlatformShelves } from "@/components/landing/DealSections";
import { BudgetPicks } from "@/components/landing/BudgetPicks";
import { CtaBand } from "@/components/landing/CtaBand";
import { Faq, HowItWorks } from "@/components/landing/Sections";
import {
  getAllTimeLows,
  getBudgetPicks,
  getFilterFacets,
  getLatestDeals,
  getPlatformShelves,
  getRecentDrops,
} from "@/lib/db/deals";
import { getShelves } from "@/lib/db/shelves";
import { getHistorySpotlight } from "@/lib/db/spotlight";
import { site, storeMeta } from "@/lib/config";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

/**
 * Eight queries build the landing page. Against the local SQLite file they were
 * free; against the production database each one is a handful of network round
 * trips, so a per-visit render would spend seconds waiting on the wire. The page
 * keeps rendering per request — a landing page with stale prices is worse than a
 * slow one — but the numbers behind it are reused for five minutes.
 */
const loadHomeData = unstable_cache(
  async () => {
    const [shelves, drops, lows, platform, facets, live, budget] = await Promise.all([
      getShelves(6, 6),
      getRecentDrops(14),
      getAllTimeLows(12),
      getPlatformShelves(6),
      getFilterFacets(),
      getLatestDeals(8),
      getBudgetPicks(6),
    ]);

    // The hero's floating cards all describe ONE product — the one with the
    // deepest recorded history and a genuine recent drop. Every number on the
    // hero comes from the database.
    const spotlight = await getHistorySpotlight();
    return { shelves, drops, lows, platform, facets, live, budget, spotlight };
  },
  ["homepage-data-v1"],
  { revalidate: 300 },
);

export default async function HomePage() {
  const { shelves, drops, lows, platform, facets, live, budget, spotlight } = await loadHomeData();

  const featured: FeaturedDeal | null = spotlight
    ? {
        title: spotlight.title,
        imageUrl: spotlight.imageUrl,
        price: spotlight.price,
        mrp: spotlight.mrp,
        discount: spotlight.discountPct || null,
        rating: spotlight.rating,
        reviewCount: null,
        merchant: spotlight.merchant,
        href: spotlight.href,
        series: spotlight.series,
        low: spotlight.low,
        lastDrop: spotlight.lastDrop,
        points: spotlight.points,
      }
    : null;

  // Filter pills — the old home feed's pill row, wired to the live filters.
  const filters = [
    { label: "All Deals", href: "/deals" },
    { label: "Steep Drops", href: "/deals?sort=drop" },
    { label: "All-Time Lows", href: "/deals?sort=allTimeLow" },
    { label: "Most Tracked", href: "/deals?sort=history" },
    ...facets.priceCaps
      .filter((p) => p.count > 0)
      .slice(0, 2)
      .map((p) => ({ label: `Under ₹${p.max.toLocaleString("en-IN")}`, href: `/deals?priceMax=${p.max}`, count: p.count })),
    ...facets.discounts
      .filter((d) => d.count > 0 && d.min >= 50 && d.count >= 5)
      .map((d) => ({ label: `${d.min}% off`, href: `/deals?discountMin=${d.min}`, count: d.count })),
    ...facets.stores
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((s) => ({
        label: storeMeta(s.merchant).name,
        href: `/deals?store=${s.merchant}`,
        count: s.count,
      })),
  ];

  return (
    <>
      <Hero featured={featured} />

      {/* ---------- the products ---------- */}
      <LiveDeals deals={live} />

      <BudgetPicks bands={budget} />

      <SmartSetupsTeaser />

      <DealsMovingNow deals={drops} filters={filters} />

      <AllTimeLows deals={lows} />

      {shelves.length > 0 && (
        <section className="py-6">
          <Container size="wide">
            <div className="mb-7">
              <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-headline">
                The strongest buy in every category
              </h2>
              <p className="mt-1.5 max-w-[650px] text-[14.5px] leading-[1.5] text-body">
                Cheap against its own recorded history, well rated, and available across every
                store we track. Expensive shelf-fillers are left out.
              </p>
            </div>

            <div className="space-y-6">
              {shelves.map((s) => (
                <CategoryPanel key={s.category} shelf={s} />
              ))}
            </div>
          </Container>
        </section>
      )}

      <PlatformShelves shelves={platform} />

      <HowItWorks />
      <Faq />
      <CtaBand />
    </>
  );
}
