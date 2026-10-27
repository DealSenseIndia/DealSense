import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { formatPostDate, getAllPosts, getPost } from "@/lib/blog";
import { getBlogProducts } from "@/lib/db/blogProducts";
import { getSetupSpace, isSetupSpace } from "@/lib/setups/blueprints";
import { site, storeMeta } from "@/lib/config";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Article not found" };
  const url = `${site.url}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const products = await getBlogProducts(post.products).catch(() => []);
  const setups = post.setups.filter(isSetupSpace).map((key) => getSetupSpace(key));
  const more = getAllPosts().filter((p) => p.slug !== post.slug).slice(0, 2);
  const url = `${site.url}/blog/${post.slug}`;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "DealSense", url: site.url },
    publisher: {
      "@type": "Organization",
      name: "DealSense",
      logo: { "@type": "ImageObject", url: `${site.url}/brand/dealsense-icon.png` },
    },
    keywords: post.tags.join(", "),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      { "@type": "ListItem", position: 2, name: "Journal", item: `${site.url}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };
  const json = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

  return (
    <div className="pb-16">
      <Container size="narrow" className="pt-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted">
          <Link href="/" className="hover:text-headline">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/blog" className="hover:text-headline">Journal</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="line-clamp-1 text-headline">{post.title}</span>
        </nav>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-muted">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span>·</span>
            <span>{post.readingMinutes} min read</span>
            {post.updated && post.updated !== post.date ? (
              <span className="rounded-full border border-hairline bg-subtle px-2 py-0.5 normal-case">
                updated {formatPostDate(post.updated)}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-[30px] font-extrabold leading-[1.12] tracking-[-0.03em] text-headline sm:text-[38px]">
            {post.title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-body">{post.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-hairline bg-card px-2.5 py-1 text-[10.5px] font-bold text-secondary">
                {tag}
              </span>
            ))}
          </div>
        </header>

        <article
          className="prose-ds mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        {products.length > 0 && (
          <section className="mt-10 rounded-2xl border border-hairline bg-card p-4 shadow-card">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-secondary">
              Mentioned here, with the price history behind it
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {products.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/product/${p.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-hairline bg-subtle/60 p-2.5 transition-colors hover:border-hairline-strong"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-hairline bg-card">
                      <ProductThumb
                        imageUrl={p.imageUrl}
                        alt={p.title}
                        merchant={p.merchant}
                        sizes="56px"
                        padding="p-0.5"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[12px] font-semibold leading-snug text-headline">{p.title}</div>
                      <div className="mt-0.5 text-[10px] text-muted">
                        {storeMeta(p.merchant).name}
                        {p.price != null ? ` · ${formatINR(p.price)}` : ""}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {setups.length > 0 && (
          <section className="mt-6 grid gap-2 sm:grid-cols-2">
            {setups.map((space) => (
              <Link
                key={space.key}
                href={`/setups/${space.key}`}
                className="rounded-xl border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] p-3 transition-colors hover:border-emerald-accent/50"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
                  Room guide
                </div>
                <div className="mt-0.5 text-[13px] font-extrabold text-headline">{space.title}</div>
                <div className="text-[11px] text-secondary">The full build, priced from tracked listings →</div>
              </Link>
            ))}
          </section>
        )}

        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-muted">
          DealSense earns a commission when you buy through its links. Rankings and verdicts are
          computed from recorded prices, not paid placement; every product page shows the date of its
          newest recorded price.
        </p>

        {more.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-secondary">Keep reading</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {more.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-xl border border-hairline bg-card p-4 hover:border-hairline-strong">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{formatPostDate(p.date)}</div>
                  <div className="mt-1 text-[13.5px] font-extrabold leading-snug text-headline">{p.title}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </Container>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(breadcrumbLd) }} />
    </div>
  );
}
