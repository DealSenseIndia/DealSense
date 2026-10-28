import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { listBrandPages } from "@/lib/db/brandPages";

export const metadata: Metadata = {
  title: "Brands we track",
  description:
    "Every brand with enough tracked products for its own price-history page — phones, laptops, fashion, beauty and more.",
  alternates: { canonical: "/brands" },
};

export const revalidate = 600;

export default async function BrandsPage() {
  const brands = await listBrandPages();

  return (
    <section className="relative py-8 sm:py-10">
      <Container size="wide">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[40px]">
          Brands we <span className="text-gradient-brand">track</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-body">
          {brands.length} brands with at least five tracked products. Each page shows every product
          we hold for that brand, with its own dated price record.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {brands.map((b) => (
            <Link
              key={b.slug}
              href={`/brands/${b.slug}`}
              className="inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-3.5 py-2 text-[12.5px] font-bold text-body transition-all hover:-translate-y-px hover:border-emerald-400/60 hover:text-headline"
            >
              {b.name}
              <span className="tabular text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">
                {b.count}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-[12.5px] text-muted">
          Looking for a product instead?{" "}
          <Link href="/categories" className="font-bold text-[var(--dw-green-mid)] hover:underline">
            Browse all categories
          </Link>
          .
        </p>
      </Container>
    </section>
  );
}
