import type { Metadata } from "next";
import Link from "next/link";
import { Zap } from "lucide-react";
import { unstable_cache } from "next/cache";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { DealGrid } from "@/components/deals/DealGrid";
import { getFilteredDeals, getFilterFacets } from "@/lib/db/deals";

export const metadata: Metadata = {
  title: "Live deals",
  description:
    "Real, verified price drops across Amazon, Flipkart, Myntra, Nykaa, Tata CLiQ and more — every one backed by recorded price history.",
  alternates: { canonical: "/deals" },
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Two minutes of caching per filter combination. The underlying prices move on
 * a twenty-minute sync, so this cannot show a number the database no longer
 * holds; it just stops every visitor paying for the same read.
 */
const loadDeals = unstable_cache(
  async (
    priceMax: number | null,
    discountMin: number | null,
    store: string | null,
    category: string | null,
    multiStore: boolean,
    sort: string | null,
  ) => {
    const [deals, facets] = await Promise.all([
      getFilteredDeals({
        priceMax: priceMax ?? undefined,
        discountMin: discountMin ?? undefined,
        store: store ?? undefined,
        category: category ?? undefined,
        multiStore,
        sort: (sort ?? undefined) as "drop" | "allTimeLow" | "discount" | "history" | undefined,
      }),
      getFilterFacets(),
    ]);
    return { deals, facets };
  },
  ["deals-page-v1"],
  { revalidate: 120 },
);

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    priceMax?: string;
    discountMin?: string;
    store?: string;
    category?: string;
    multiStore?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const priceMax = sp.priceMax ? Number(sp.priceMax) : undefined;
  const discountMin = sp.discountMin ? Number(sp.discountMin) : undefined;
  const store = sp.store;
  const category = sp.category;
  const multiStore = sp.multiStore === "1";
  const sort = sp.sort as "drop" | "allTimeLow" | "discount" | "history" | undefined;

  const { deals, facets } = await loadDeals(
    priceMax ?? null,
    discountMin ?? null,
    store ?? null,
    category ?? null,
    multiStore,
    sort ?? null,
  );

  return (
    <section className="relative py-12">
      <Container size="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[30px] font-extrabold tracking-[-0.025em] text-headline sm:text-[38px]">
            Live deals
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/live"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-[var(--dw-green-surface)] px-3 text-[11.5px] font-extrabold text-[var(--dw-green-mid)] transition-colors hover:border-emerald-500/50"
            >
              <Zap className="h-3.5 w-3.5" /> Live drops
            </Link>
            <span className="tabular rounded-xl border border-hairline bg-card px-4 py-2.5 text-[13px] font-extrabold text-secondary">
              {deals.length} products
            </span>
          </div>
        </div>

        <PageSearch className="mt-6 max-w-xl" />

        <DealGrid
          deals={deals}
          facets={facets}
          active={{ priceMax, discountMin, store, category, multiStore, sort }}
        />
      </Container>
    </section>
  );
}
