import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { formatPostDate, getAllPosts } from "@/lib/blog";
import { site } from "@/lib/config";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "The DealSense journal — how Indian prices actually move",
  description:
    "Plain-English guides to reading price history, spotting fake discounts and building a room on a real budget. Every claim links to the recorded prices behind it.",
  alternates: { canonical: `${site.url}/blog` },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const [lead, ...rest] = posts;

  return (
    <div className="pb-16">
      <Container size="wide" className="pt-10">
        <header className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
            <BookOpen className="h-3.5 w-3.5" /> The journal
          </span>
          <h1 className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-headline sm:text-[42px]">
            How Indian prices actually move
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-body">
            Short, evidence-first pieces about buying things at the right time — every product we
            mention links to its own recorded price history, not to a press release.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-hairline bg-subtle p-8 text-center text-[13px] text-secondary">
            The first pieces are being written. Check back shortly.
          </p>
        ) : (
          <>
            <Link
              href={`/blog/${lead.slug}`}
              className="group mt-8 block overflow-hidden rounded-3xl border border-hairline bg-card p-6 shadow-card transition-colors hover:border-hairline-strong sm:p-8"
            >
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-muted">
                <span>{formatPostDate(lead.date)}</span>
                <span>·</span>
                <span>{lead.readingMinutes} min read</span>
                {lead.tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full border border-hairline bg-subtle px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="mt-3 max-w-2xl text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-headline sm:text-[30px]">
                {lead.title}
              </h2>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-body">{lead.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-extrabold text-[var(--dw-green-mid)]">
                Read the piece <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </Link>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group rounded-2xl border border-hairline bg-card p-5 shadow-card transition-colors hover:border-hairline-strong"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    {formatPostDate(post.date)} · {post.readingMinutes} min
                  </div>
                  <h2 className="mt-2 text-[16px] font-extrabold leading-snug text-headline">{post.title}</h2>
                  <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-secondary">{post.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
                    Read <ArrowUpRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/setups"
            className="btn-cta inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-extrabold"
          >
            Build a room, not a wishlist
          </Link>
          <Link
            href="/deals"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-hairline bg-card px-4 text-[12.5px] font-extrabold text-secondary hover:border-hairline-strong hover:text-headline"
          >
            See today&apos;s verified drops
          </Link>
        </div>
      </Container>
    </div>
  );
}
