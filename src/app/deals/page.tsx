import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { DealGrid } from "@/components/deals/DealGrid";
import { getFilteredDeals, getFilterFacets } from "@/lib/db/deals";

export const metadata: Metadata = {
  title: "Live deals",
  description:
    "Real, verified price drops across Amazon India, Flipkart and Myntra — every one backed by recorded price history.",
  alternates: { canonical: "/deals" },
};

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    priceMax?: string;
    discountMin?: string;
    store?: string;
    category?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const priceMax = sp.priceMax ? Number(sp.priceMax) : undefined;
  const discountMin = sp.discountMin ? Number(sp.discountMin) : undefined;
  const store = sp.store;
  const category = sp.category;
  const sort = sp.sort as "drop" | "allTimeLow" | "discount" | "history" | undefined;

  const [deals, facets] = await Promise.all([
    getFilteredDeals({ priceMax, discountMin, store, category, sort }),
    getFilterFacets(),
  ]);

  return (
    <section className="relative py-12">
      <Container size="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[30px] font-extrabold tracking-[-0.025em] text-headline sm:text-[38px]">
            Live deals
          </h1>
          <span className="tabular rounded-xl border border-hairline bg-card px-4 py-2.5 text-[13px] font-extrabold text-secondary">
            {deals.length} products
          </span>
        </div>

        <PageSearch className="mt-6 max-w-xl" />

        <DealGrid
          deals={deals}
          facets={facets}
          active={{ priceMax, discountMin, store, category, sort }}
        />
      </Container>
    </section>
  );
}
