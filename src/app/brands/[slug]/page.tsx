import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, LineChart } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductShelfCard } from "@/components/product/ProductShelfCard";
import { getBrandPage, listBrandPages } from "@/lib/db/brandPages";
import { site } from "@/lib/config";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getBrandPage(slug);
  if (!page) return { title: "Brand not found" };
  const title = `${page.name} price history — ${page.count} tracked products`;
  const description = `Every ${page.name} product DealSense tracks, with real dated price records and a plain buy-or-wait verdict. See the lowest price in our record.`;
  return {
    title,
    description,
    alternates: { canonical: `/brands/${page.slug}` },
    openGraph: { title: `${title} · ${site.name}`, description },
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, all] = await Promise.all([getBrandPage(slug), listBrandPages()]);
  if (!page) notFound();

  const related = all.filter((p) => p.slug !== page.slug).slice(0, 10);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${page.name} price history`,
    url: `${site.url}/brands/${page.slug}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.count,
      itemListElement: page.products.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${site.url}/product/${p.slug}`,
        name: p.title,
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      { "@type": "ListItem", position: 2, name: "Brands", item: `${site.url}/brands` },
      { "@type": "ListItem", position: 3, name: page.name, item: `${site.url}/brands/${page.slug}` },
    ],
  };

  return (
    <section className="relative py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <Container size="wide">
        <nav className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-muted">
          <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/brands" className="text-[var(--dw-green-mid)] hover:underline">
            Brands
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-body">{page.name}</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[38px]">
              {page.name} <span className="text-gradient-brand">price history</span>
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-body">
              {page.count} {page.name} products, each with its own dated price record. Every card
              shows the cheapest current price across the stores we track for that product.
            </p>
          </div>
          <Link
            href={`/search?q=${encodeURIComponent(page.name)}`}
            className="btn-cta inline-flex h-10 items-center gap-2 rounded-btn px-4 text-[13px] font-extrabold"
          >
            <LineChart className="h-4 w-4" /> Search {page.name}
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {page.products.map((p) => (
            <ProductShelfCard key={p.id} product={p} />
          ))}
        </div>

        {related.length > 0 ? (
          <div className="mt-12 border-t border-hairline pt-8">
            <h2 className="text-[15px] font-extrabold text-headline">Other brands we track</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/brands/${r.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-3 py-1.5 text-[12px] font-bold text-body transition-all hover:-translate-y-px hover:border-emerald-400/60 hover:text-headline"
                >
                  {r.name}
                  <span className="tabular text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">
                    {r.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
