import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
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
              The full map of what DealSense covers — every umbrella, every sub-category. A badge
              shows how many products we actually track with real recorded price history.
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
                    id={`${g.slug}-side`}
                    href={`/categories#${g.slug}`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-body transition-colors hover:bg-elevated hover:text-headline"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-elevated text-[13px]">
                      {g.icon}
                    </span>
                    <span className="truncate">{g.name}</span>
                    {g.count > 0 ? (
                      <span className="tabular ml-auto text-[10.5px] font-bold text-[var(--dw-green-mid)]">
                        {g.count}
                      </span>
                    ) : (
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted" />
                    )}
                  </Link>
                ))}
              </nav>
            </aside>

            {/* ---- grid: every umbrella, every sub-category ---- */}
            <div className="space-y-5">
              {groups.map((g) => (
                <section
                  key={g.slug}
                  id={g.slug}
                  className="group scroll-mt-24 overflow-hidden rounded-2xl border border-hairline bg-card shadow-card transition-all hover:border-emerald-400/40"
                >
                  {/* umbrella header */}
                  <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-subtle px-5 py-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[22px]">
                      {g.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[17px] font-extrabold tracking-tight text-headline">
                        {g.name}
                      </h3>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                        {g.description}
                      </p>
                    </div>
                    <span
                      className={
                        g.count > 0
                          ? "tabular shrink-0 rounded-full bg-[var(--dw-green-surface)] px-3 py-1 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]"
                          : "tabular shrink-0 rounded-full border border-hairline px-3 py-1 text-[11.5px] font-bold text-muted"
                      }
                    >
                      {g.count > 0
                        ? `${g.count} tracked`
                        : "not tracked yet"}
                    </span>
                  </div>

                  {/* sub-categories and their leaves */}
                  <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
                    {g.children.map((c) => (
                      <div key={c.name}>
                        <div className="flex items-baseline gap-2">
                          <h4 className="text-[12.5px] font-extrabold uppercase tracking-wider text-headline">
                            {c.name}
                          </h4>
                          {c.count > 0 ? (
                            <span className="tabular text-[10.5px] font-bold text-[var(--dw-green-mid)]">
                              {c.count}
                            </span>
                          ) : null}
                        </div>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {c.leaves.map((l) => (
                            <li key={l.name}>
                              <Link
                                href={`/deals?category=${encodeURIComponent(l.name)}`}
                                title={
                                  l.count > 0
                                    ? `${l.count} tracked`
                                    : "We do not track this yet"
                                }
                                className={
                                  l.count > 0
                                    ? "inline-flex items-center gap-1 rounded-full border border-hairline bg-card px-2.5 py-1 text-[11.5px] font-semibold text-body transition-all hover:-translate-y-px hover:border-emerald-400/60 hover:text-headline"
                                    : "inline-flex items-center rounded-full border border-dashed border-hairline px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:text-secondary"
                                }
                              >
                                {l.name}
                                {l.count > 0 ? (
                                  <span className="tabular text-[10px] font-bold text-[var(--dw-green-mid)]">
                                    {l.count}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
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
    { t: "Compare Everywhere", s: "Every store we track, side by side." },
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
