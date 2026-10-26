import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ProductDetail } from "@/components/analyzer/ProductDetail";
import { loadAnalysisBySlug } from "@/lib/engine/load";
import { getReviewsForProduct } from "@/lib/db/queries";
import { getSimilarProducts } from "@/lib/db/similar";
import { getStoreComparison } from "@/lib/db/compare";
import { getVariantSiblings } from "@/lib/db/variantSiblings";
import { site } from "@/lib/config";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";
/** A cold analysis is a handful of queries; give it room beyond Hobby's default. */
export const maxDuration = 30;

/**
 * Metadata and the page body both need the analysis. React's request cache
 * makes that one database read per visit, not two, and the retry covers a
 * dropped socket without turning it into a 500.
 */
const loadForRequest = cache(async (slug: string) => {
  try {
    return await loadAnalysisBySlug(slug);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return await loadAnalysisBySlug(slug);
  }
});

const loadSidePanels = unstable_cache(
  async (productId: string, listingId: string, listingTitle: string, slug: string) => {
    const [reviews, similar, comparison, siblings] = await Promise.all([
      getReviewsForProduct(productId),
      getSimilarProducts(productId, 8),
      getStoreComparison(productId, listingId, listingTitle),
      getVariantSiblings(productId, 8),
    ]);
    return { reviews, similar, comparison, siblings, slug };
  },
  ["product-side-panels-v1"],
  { revalidate: 120 },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadForRequest(slug);
  if (!result?.product) return { title: "Product not found" };

  const title = result.listing?.price
    ? `${result.product.title} — ${formatINR(result.listing.price)}`
    : result.product.title;
  const verdict = result.verdict?.verdict;
  const description =
    verdict && verdict !== "INSUFFICIENT"
      ? `DealSense verdict: ${verdict}. Real price history, true landed cost and cross-store comparison for ${result.product.title}.`
      : `Live price, real price history and true landed cost for ${result.product.title}.`;

  return {
    title,
    description,
    alternates: { canonical: `/product/${slug}` },
    openGraph: {
      title: `${title} · ${site.name}`,
      description,
      images: result.product.imageUrl ? [{ url: result.product.imageUrl }] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ opt?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const result = await loadForRequest(slug);
  if (!result?.product || !result.listing) notFound();

  const product = result.product;
  const listing = result.listing;

  // The option the visitor picked on the page, e.g. "colour:Black".
  const opt = (() => {
    const raw = (sp.opt ?? "").trim();
    if (!raw) return null;
    const idx = raw.indexOf(":");
    if (idx <= 0) return null;
    const key = raw.slice(0, idx);
    const value = raw.slice(idx + 1);
    if (!key || !value) return null;
    return { key, value };
  })();

  // The four panels around the main analysis are read-only and change slowly.
  // Cached for two minutes per product so a busy page does not repeat their
  // round trips on every visit; the price and verdict above stay live.
  const { reviews, similar, comparison, siblings } = await loadSidePanels(
    product.id,
    listing.id,
    listing.title ?? product.title,
    slug,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    image: product.imageUrl ? [product.imageUrl] : undefined,
    category: product.category ?? undefined,
    offers: listing.price
      ? {
          "@type": "Offer",
          price: listing.price,
          priceCurrency: "INR",
          availability: listing.inStock === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          url: `${site.url}/product/${slug}`,
        }
      : undefined,
    aggregateRating:
      listing.rating && listing.reviewCount
        ? {
            "@type": "AggregateRating",
            ratingValue: listing.rating,
            reviewCount: listing.reviewCount,
          }
        : undefined,
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      { "@type": "ListItem", position: 2, name: "Deals", item: `${site.url}/deals` },
      { "@type": "ListItem", position: 3, name: product.title, item: `${site.url}/product/${slug}` },
    ],
  };

  return (
    <section className="relative py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Container size="wide">
        <ProductDetail
          result={result}
          reviews={reviews}
          similar={similar}
          comparison={comparison}
          siblings={siblings}
          option={opt}
          slug={slug}
        />
      </Container>
    </section>
  );
}
