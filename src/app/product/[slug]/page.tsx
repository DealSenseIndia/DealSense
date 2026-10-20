import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { AnalysisView } from "@/components/analyzer/AnalysisView";
import { loadAnalysisBySlug } from "@/lib/engine/load";
import { getReviewsForProduct } from "@/lib/db/queries";
import { getSimilarProducts } from "@/lib/db/similar";
import { site } from "@/lib/config";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadAnalysisBySlug(slug);
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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadAnalysisBySlug(slug);
  if (!result?.product || !result.listing) notFound();

  const product = result.product;
  const listing = result.listing;

  const [reviews, similar] = await Promise.all([
    getReviewsForProduct(product.id),
    getSimilarProducts(product.id, 8),
  ]);

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
    <section className="relative py-10 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Container>
        <AnalysisView
          result={result}
          reviews={reviews}
          similar={similar}
          storeReviewCount={listing.reviewCount}
        />
      </Container>
    </section>
  );
}
