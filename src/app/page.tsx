import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Hero } from "@/components/landing/Hero";
import { CategoryPanel, CategoryStrip } from "@/components/landing/CategoryPanel";
import { CommunityBar, CtaBand, Faq, HowItWorks, Integrity } from "@/components/landing/Sections";
import { getShelves, getCatalogueStats, getTotalObservations, STORE_META } from "@/lib/db/shelves";
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
  Audio: "🎧",
  "In-Ear": "🎵",
  "Over-Ear": "🎧",
  "Wrist Watches": "⌚",
  Dresses: "👗",
  Kurtas: "👘",
  Sarees: "🥻",
  Sunglasses: "🕶️",
  "Air Fryers": "🍟",
  Perfume: "🧴",
  Backpacks: "🎒",
  "Bluetooth Speakers": "🔊",
  "Keyboard & Mouse Sets": "⌨️",
  "Basic Cases": "📱",
  "Traditional Laptops": "💼",
  "All in One PCs": "🖥️",
  Serums: "🧴",
};

export default async function HomePage() {
  const [shelves, stats, points] = await Promise.all([
    getShelves(6),
    getCatalogueStats(),
    getTotalObservations(),
  ]);

  const categoryItems = shelves.slice(0, 14).map((s) => ({
    name: s.category,
    count: s.products.length,
    emoji: EMOJI[s.category] ?? "🛍️",
  }));

  return (
    <>
      <Hero
        pointsTracked={points}
        stores={stats.stores}
        products={stats.products}
      />

      <CommunityBar />

      {/* ---------- stats strip (Buyhatke style) ---------- */}
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

      {/* ---------- store strip ---------- */}
      <section className="border-b border-hairline bg-subtle py-7">
        <Container>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <span className="text-[12px] font-bold text-muted">We track</span>
            {stats.storeRows.map(({ merchant, count }) => {
              const m = STORE_META[merchant] ?? {
                name: merchant,
                short: merchant.slice(0, 2).toUpperCase(),
                color: "#64748B",
              };
              return (
                <span
                  key={merchant}
                  title={`${m.name} — ${count} products`}
                  className="grid h-9 w-9 place-items-center rounded-xl text-[10px] font-black text-white shadow-sm"
                  style={{ background: m.color }}
                >
                  {m.short}
                </span>
              );
            })}
            <span className="text-[12px] font-bold text-muted">
              + 2,000 more stores via Cuelinks
            </span>
          </div>
        </Container>
      </section>

      {/* ---------- category shelves (Buyhatke panels) ---------- */}
      {shelves.length > 0 && (
        <section className="py-14">
          <Container size="wide">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[12px] font-extrabold uppercase tracking-widest text-[var(--dw-green-mid)]">
                  Top deals across categories
                </p>
                <h2 className="mt-2 text-[28px] font-extrabold tracking-[-0.025em] text-headline sm:text-[34px]">
                  Every product here has real price history
                </h2>
                <p className="mt-2 max-w-2xl text-[14px] text-body">
                  We only list products we can actually track. Every price, discount and verdict below
                  is backed by recorded observations.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {shelves.map((s) => (
                <CategoryPanel key={s.category} shelf={s} />
              ))}
            </div>
          </Container>
        </section>
      )}

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
