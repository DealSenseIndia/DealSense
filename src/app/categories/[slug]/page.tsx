import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, LineChart } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { getCategoryPage, listCategoryPages, type CategoryProduct } from "@/lib/db/categoryPages";
import { formatINR } from "@/lib/utils";
import { site } from "@/lib/config";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCategoryPage(slug);
  if (!page) return { title: "Category not found" };
  const title = `${page.name} price history — ${page.count} tracked products`;
  const description = `Compare ${page.count} ${page.name.toLowerCase()} on DealSense: real, dated price records, the lowest price in our record and a plain buy-or-wait verdict.`;
  return {
    title,
    description,
    alternates: { canonical: `/categories/${page.slug}` },
    openGraph: { title: `${title} · ${site.name}`, description },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, all] = await Promise.all([getCategoryPage(slug), listCategoryPages()]);
  if (!page) notFound();

  const related = all.filter((p) => p.slug !== page.slug).slice(0, 8);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${page.name} price history`,
    url: `${site.url}/categories/${page.slug}`,
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
      { "@type": "ListItem", position: 2, name: "Categories", item: `${site.url}/categories` },
      {
        "@type": "ListItem",
        position: 3,
        name: page.name,
        item: `${site.url}/categories/${page.slug}`,
      },
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
          <Link href="/categories" className="text-[var(--dw-green-mid)] hover:underline">
            Categories
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
              {page.count} {page.name.toLowerCase()} products, each with its own dated price record.
              Every card shows the cheapest current price across the stores we track for that
              product. Open one to see the full history and the verdict.
            </p>
          </div>
          <Link
            href={`/deals?category=${encodeURIComponent(page.name)}`}
            className="btn-cta inline-flex h-10 items-center gap-2 rounded-btn px-4 text-[13px] font-extrabold"
          >
            <LineChart className="h-4 w-4" /> See current deals
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {page.products.map((p) => (
            <CategoryCard key={p.id} product={p} />
          ))}
        </div>

        {related.length > 0 ? (
          <div className="mt-12 border-t border-hairline pt-8">
            <h2 className="text-[15px] font-extrabold text-headline">Other categories we track</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/categories/${r.slug}`}
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

function CategoryCard({ product }: { product: CategoryProduct }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-emerald-400/50"
    >
      <div className="relative aspect-square w-full bg-subtle">
        <ProductThumb
          imageUrl={product.imageUrl}
          alt={product.title}
          merchant={product.merchant}
          className="h-full w-full"
          sizes="(max-width: 640px) 50vw, 240px"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-headline group-hover:text-[var(--dw-green-mid)]">
          {product.title}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="tabular text-[15px] font-extrabold text-headline">
            {formatINR(product.price)}
          </span>
          <span className="text-[10.5px] font-semibold text-muted">
            {product.points.toLocaleString("en-IN")} dated prices
          </span>
        </div>
      </div>
    </Link>
  );
}
