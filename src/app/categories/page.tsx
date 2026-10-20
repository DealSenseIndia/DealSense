import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { listCategories, getCatalogueStats } from "@/lib/db/market";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Categories",
  description: "Browse verified price histories and deals by product category.",
  alternates: { canonical: "/categories" },
};

export const dynamic = "force-dynamic";

const EMOJI: Record<string, string> = {
  Smartphones: "📱",
  Laptops: "💻",
  Audio: "🎧",
  Televisions: "📺",
  Gaming: "🎮",
  Appliances: "🔌",
  Fashion: "👕",
  Beauty: "💄",
  Home: "🛋️",
  Accessories: "🔌",
  Books: "📚",
  Cameras: "📷",
  Wearables: "⌚",
};

export default async function CategoriesPage() {
  const [categories, stats] = await Promise.all([listCategories(), getCatalogueStats()]);

  return (
    <section className="relative py-12">
      <Container size="wide">
        <div className="max-w-2xl">
          <h1 className="text-[30px] font-extrabold tracking-tight text-headline sm:text-[36px]">
            Browse by category
          </h1>
        </div>

        <PageSearch className="mt-5 max-w-xl" />
        {stats && (
          <div className="mt-5 flex flex-wrap gap-4 text-[13px] font-bold text-secondary">
            <span>
              <span className="tabular text-headline">{stats.count}</span> listings
            </span>
            <span>
              median <span className="tabular text-headline">{formatINR(stats.median)}</span>
            </span>
            <span>
              range{" "}
              <span className="tabular text-headline">
                {formatINR(stats.low)}–{formatINR(stats.high)}
              </span>
            </span>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-hairline bg-subtle p-12 text-center">
            <div className="text-4xl">🌱</div>
            <p className="mt-3 text-[14px] text-body">
              No categories yet — analyze a few products and they will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c.category}
                href={`/search?q=${encodeURIComponent(c.category ?? "")}`}
                className="group flex items-center gap-3 rounded-card border border-hairline bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-accent/40 hover:shadow-lift"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-xl">
                  {EMOJI[c.category ?? ""] ?? "🛍️"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-extrabold text-headline">
                    {c.category}
                  </span>
                  <span className="tabular mt-0.5 block text-[12px] text-secondary">
                    {c.count} products
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-[var(--dw-green-mid)]" />
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
