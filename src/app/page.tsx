import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Hero, type FeaturedDeal } from "@/components/landing/Hero";
import { CategoryPanel } from "@/components/landing/CategoryPanel";
import { CategoryNavStrip, TrustStrip } from "@/components/landing/TrustStrip";
import {
  AllTimeLows,
  DealsMovingNow,
  DiscountTiers,
  PlatformShelves,
  PriceBuckets,
} from "@/components/landing/DealSections";
import { CommunityBar, CtaBand, Faq, HowItWorks, Integrity } from "@/components/landing/Sections";
import {
  getAllTimeLows,
  getDiscountTiers,
  getPlatformShelves,
  getPriceBuckets,
  getRecentDrops,
} from "@/lib/db/deals";
import { getShelves, getCatalogueStats, getTotalObservations } from "@/lib/db/shelves";
import { getCategoryGroups, groupForCategory } from "@/lib/db/taxonomy";
import { getHistorySpotlight } from "@/lib/db/spotlight";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [shelves, stats, points, drops, lows, buckets, tiers, platform, groups, recent] =
    await Promise.all([
      getShelves(6, 6),
      getCatalogueStats(),
      getTotalObservations(),
      getRecentDrops(14),
      getAllTimeLows(12),
      getPriceBuckets(),
      getDiscountTiers(),
      getPlatformShelves(6),
      getCategoryGroups(),
      getRecentDrops(400),
    ]);

  // Live featured product for the hero's floating cards — one product with a
  // complete, real story: deep recorded history AND a genuine recent drop.
  const spotlight = await getHistorySpotlight();
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

  // Category quick-nav strip — real top-level groups, real recent-drop counts.
  const dropCounts = new Map<string, number>();
  for (const d of recent) {
    const g = groupForCategory(d.category);
    if (!g) continue;
    dropCounts.set(g.slug, (dropCounts.get(g.slug) ?? 0) + 1);
  }
  const navItems = groups
    .map((g) => ({
      name: g.name,
      emoji: g.emoji,
      drops: dropCounts.get(g.slug) ?? 0,
      tracked: g.count,
      href: `/categories#${g.slug}`,
    }))
    .filter((g) => g.tracked > 0)
    .sort((a, b) => b.drops - a.drops || b.tracked - a.tracked)
    .slice(0, 8);

  return (
    <>
      <Hero
        productsTracked={stats.products}
        storesCompared={stats.stores}
        featured={featured}
      />

      <TrustStrip
        productsTracked={stats.products}
        pointsTracked={points}
        storesCompared={stats.stores}
        storeNames="Amazon, Flipkart, Myntra"
      />

      <CategoryNavStrip items={navItems} />

      <CommunityBar />

      <DealsMovingNow deals={drops} />

      <AllTimeLows deals={lows} />
      <PriceBuckets buckets={buckets} />

      {/* ---------- category shelves ---------- */}
      {shelves.length > 0 && (
        <section className="py-6">
          <Container size="wide">
            <div className="mb-7">
              <p className="text-[12px] font-extrabold uppercase tracking-widest text-[var(--dw-green-mid)]">
                Top deals across categories
              </p>
              <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.025em] text-headline sm:text-[32px]">
                Every product here has real price history
              </h2>
            </div>

            <div className="space-y-6">
              {shelves.map((s) => (
                <CategoryPanel key={s.category} shelf={s} />
              ))}
            </div>
          </Container>
        </section>
      )}

      <DiscountTiers tiers={tiers} />
      <PlatformShelves shelves={platform} />

      <HowItWorks />
      <Integrity />
      <Faq />
      <CtaBand />
    </>
  );
}
