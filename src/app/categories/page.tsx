import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Search, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { getCategoryGroups, getPopularSearches } from "@/lib/db/taxonomy";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "All product categories",
  description:
    "Browse every category DealSense tracks — smartphones, laptops, audio, fashion, beauty and more, each backed by real recorded price history.",
  alternates: { canonical: "/categories" },
};

export const dynamic = "force-dynamic";

const ICONS: Record<string, React.ReactNode> = {
  Laptop: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M2 20h20" />
    </svg>
  ),
  Shirt: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3 4 6l2 4 2-1v10h8V9l2 1 2-4-4-3-2 2h-4L8 3Z" />
    </svg>
  ),
  Sofa: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M2 13a2 2 0 0 1 2 2v3h16v-3a2 2 0 0 1 2-2" />
    </svg>
  ),
  Sparkles: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  ),
  Dumbbell: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </svg>
  ),
  Gamepad2: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
      <path d="M17.3 5H6.7A4.7 4.7 0 0 0 2 9.7v4.6A4.7 4.7 0 0 0 6.7 19c1.6 0 2.4-.8 3.3-1.8h4c.9 1 1.7 1.8 3.3 1.8a4.7 4.7 0 0 0 4.7-4.7V9.7A4.7 4.7 0 0 0 17.3 5Z" />
    </svg>
  ),
  BookOpen: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6v15M3 4h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3V4ZM21 4h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21V4Z" />
    </svg>
  ),
  Baby: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01M15 10h.01M8.5 15a4.5 4.5 0 0 0 7 0" />
    </svg>
  ),
  Car: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16v2M20 16v2M3 16h18v-4l-2-5H5L3 12v4Z" />
      <path d="M6 12h12" />
    </svg>
  ),
  Plane: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 19 12 5l2 14M8 19h8M2 12l20-6-4 8 4 8-20-6 4-4Z" />
    </svg>
  ),
  Dog: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3 4 8l2 2v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-6l2-2-2-5" />
      <path d="M9 13h.01M15 13h.01" />
    </svg>
  ),
};

export default async function CategoriesPage() {
  const [groups, popular] = await Promise.all([getCategoryGroups(), getPopularSearches()]);

  return (
    <section className="relative py-8">
      <Container size="wide">
        {/* breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
          <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>All Categories</span>
        </nav>

        {/* title */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[40px]">
              All Product <span className="text-gradient-brand">Categories</span>
            </h1>
            <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-body">
              Every category is built from products we actually track — each one with real recorded
              price history behind it.
            </p>
          </div>
          <PageSearch className="w-full max-w-md" placeholder="Search for categories, products, brands…" />
        </div>

        {/* popular chips */}
        {popular.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold text-muted">Popular right now:</span>
            {popular.slice(0, 8).map((p) => (
              <Link
                key={p}
                href={`/deals?category=${encodeURIComponent(p)}`}
                className="rounded-full border border-hairline bg-card px-3 py-1.5 text-[12px] font-bold text-body transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:text-headline"
              >
                {p}
              </Link>
            ))}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-hairline bg-subtle p-12 text-center">
            <p className="text-[14px] text-body">No categories yet — track a product to start building.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[236px_1fr]">
            {/* ---- sidebar ---- */}
            <aside className="h-fit rounded-2xl border border-hairline bg-card p-4 shadow-card lg:sticky lg:top-20">
              <h2 className="mb-3 px-2 text-[13px] font-extrabold text-headline">Shop by Category</h2>
              <nav className="space-y-0.5">
                <Link
                  href="/categories"
                  className="flex items-center gap-2.5 rounded-lg bg-[var(--dw-green-surface)] px-2.5 py-2 text-[13px] font-bold text-[var(--dw-green-mid)]"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--dw-green-surface)]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  All Categories
                  <ChevronRight className="ml-auto h-3.5 w-3.5" />
                </Link>
                {groups.map((g) => (
                  <Link
                    key={g.slug}
                    id={g.slug}
                    href={`/categories#${g.slug}`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-body transition-colors hover:bg-elevated hover:text-headline"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-elevated text-secondary">
                      {ICONS[g.icon]}
                    </span>
                    {g.name}
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted" />
                  </Link>
                ))}
              </nav>
            </aside>

            {/* ---- grid ---- */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <div
                  key={g.slug}
                  id={g.slug}
                  className="group flex scroll-mt-24 flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-lift"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-subtle">
                    {g.coverImage ? (
                      <Image
                        src={g.coverImage}
                        alt={g.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 340px"
                        className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-3xl">{g.emoji}</div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="text-[15px] font-extrabold text-headline">{g.name}</h3>
                    <div className="mt-1 text-[12.5px] font-bold text-[var(--dw-green-mid)]">
                      {g.count} deal{g.count === 1 ? "" : "s"}
                    </div>
                    <ul className="mt-3 flex-1 space-y-1">
                      {g.subcategories.slice(0, 6).map((s) => (
                        <li key={s}>
                          <Link
                            href={`/deals?category=${encodeURIComponent(s)}`}
                            className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[12px] text-body transition-colors hover:bg-elevated hover:text-headline"
                          >
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
                            {s}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={
                        g.subcategories[0]
                          ? `/deals?category=${encodeURIComponent(g.subcategories[0])}`
                          : "/deals"
                      }
                      className="mt-3 flex items-center gap-1 text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
                    >
                      Explore {g.name} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- trust strip ---- */}
        <TrustStrip />
      </Container>
    </section>
  );
}

function TrustStrip() {
  const items = [
    { t: "Real Price History", s: "Every price we show was actually observed." },
    { t: "Buy / Wait / Avoid", s: "A plain verdict, with the maths shown." },
    { t: "Compare Everywhere", s: "Amazon, Flipkart and Myntra side by side." },
    { t: "True Landed Cost", s: "Delivery, coupons and card offers included." },
    { t: "Save Money", s: "Transparent deals. No fake discounts." },
  ];
  return (
    <div className="mt-14 grid gap-5 border-t border-hairline pt-8 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <div key={i.t} className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <Check />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-extrabold text-headline">{i.t}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-body">{i.s}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
