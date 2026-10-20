import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Hero } from "@/components/landing/Hero";
import { CategoryPanel, CategoryStrip } from "@/components/landing/CategoryPanel";
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
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

const EMOJI: Record<string, string> = {
  Smartphones: "📱",
  Laptops: "💻",
  "Traditional Laptops": "💼",
  Audio: "🎧",
  "In-Ear": "🎵",
  "Over-Ear": "🎧",
  Televisions: "📺",
  "Wrist Watches": "⌚",
  Dresses: "👗",
  Kurtas: "👘",
  Sarees: "🥻",
  Jeans: "👖",
  Tshirts: "👕",
  "Running Shoes": "👟",
  Sneakers: "👟",
  "Nike Sports Shoes": "👟",
  "Air Fryers": "🍟",
  Perfume: "🧴",
  Lipstick: "💄",
  Backpacks: "🎒",
  Sunglasses: "🕶️",
};

export default async function HomePage() {
  const [shelves, stats, points, drops, lows, buckets, tiers, platform] = await Promise.all([
    getShelves(6),
    getCatalogueStats(),
    getTotalObservations(),
    getRecentDrops(14),
    getAllTimeLows(12),
    getPriceBuckets(),
    getDiscountTiers(),
    getPlatformShelves(6),
  ]);

  const categoryItems = shelves.slice(0, 14).map((s) => ({
    name: s.category,
    count: s.products.length,
    emoji: EMOJI[s.category] ?? "🛍️",
  }));

  return (
    <>
      <Hero pointsTracked={points} stores={stats.stores} products={stats.products} />

      <CommunityBar />

      <DealsMovingNow deals={drops} />

      {/* ---------- stats strip ---------- */}
      <section className="border-b border-hairline py-8">
        <Container>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-center text-[13px] font-extrabold text-secondary">
            <Stat value={`${points.toLocaleString("en-IN")}+`} label="Price points tracked" />
            <Stat value={`${stats.stores}`} label="Stores compared" />
            <Stat value={`${stats.products.toLocaleString("en-IN")}+`} label="Products tracked" />
            <Stat value="100%" label="Real observations" />
          </div>
        </Container>
      </section>

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
              <p className="mt-2 max-w-2xl text-[14px] text-body">
                We only list products we can actually track. Every price, discount and verdict below
                is backed by recorded observations.
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

      <DiscountTiers tiers={tiers} />
      <PlatformShelves shelves={platform} />

      {/* ---------- category strip ---------- */}
      {categoryItems.length > 0 && (
        <section className="border-t border-hairline py-12">
          <Container size="wide">
            <h2 className="text-[20px] font-extrabold tracking-tight text-headline">
              Browse every category
            </h2>
            <div className="mt-5">
              <CategoryStrip items={categoryItems} />
            </div>
          </Container>
        </section>
      )}

      <HowItWorks />
      <Integrity />
      <Faq />
      <CtaBand />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular text-[17px] font-extrabold text-[var(--dw-green-mid)]">{value}</span>
      <span className="text-secondary">{label}</span>
    </span>
  );
}
