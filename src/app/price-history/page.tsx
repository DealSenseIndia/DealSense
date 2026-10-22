import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LineChart, TrendingDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { getAllTimeLows, getLatestDeals } from "@/lib/db/deals";
import { formatINR, timeAgo } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Price history",
  description:
    "Every price point DealSense has actually recorded — low, high, typical and the exact moment the price moved.",
  alternates: { canonical: "/price-history" },
};

export const dynamic = "force-dynamic";

export default async function PriceHistoryPage() {
  const [lows, latest] = await Promise.all([getAllTimeLows(24), getLatestDeals(12)]);

  return (
    <section className="relative py-8">
      <Container size="wide">
        <nav className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
          <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Price History</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[40px]">
              Price <span className="text-gradient-brand">History</span>
            </h1>
            <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-body">
              Every point below was actually observed on a store page — not estimated, not modelled.
            </p>
          </div>
          <PageSearch className="w-full max-w-md" placeholder="Search a product to see its history…" />
        </div>

        {/* ---- all-time lows ---- */}
        <div className="mt-9">
          <div className="flex flex-wrap items-center gap-2.5">
            <TrendingDown className="h-4 w-4 text-emerald-500" />
            <h2 className="text-[18px] font-extrabold tracking-tight text-headline">
              At their all-time low
            </h2>
            <Link
              href="/deals?sort=allTimeLow"
              className="text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              see all →
            </Link>
          </div>

          {lows.length === 0 ? (
            <Empty />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {lows.map((d) => (
                <Link
                  key={d.listingId ?? `${d.slug}-${d.merchant}`}
                  href={`/product/${d.slug}`}
                  className="group overflow-hidden rounded-2xl border border-hairline bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                    <ProductThumb
                      imageUrl={d.imageUrl}
                      alt={d.title}
                      merchant={d.merchant}
                      sizes="(max-width: 640px) 50vw, 200px"
                      imageClassName="transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-white">
                      All-time low
                    </span>
                  </div>
                  <div className="mt-2 line-clamp-2 min-h-[2rem] text-[11.5px] font-bold leading-snug text-headline">
                    {d.title}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <StoreLogo merchant={d.merchant} size={14} />
                    <span className="tabular text-[13px] font-extrabold text-headline">
                      {formatINR(d.price)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-muted">
                    {d.observations} pts · {timeAgo(d.lastSeenAt ?? Date.now())}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ---- most tracked ---- */}
        <div className="mt-12">
          <div className="flex flex-wrap items-center gap-2.5">
            <LineChart className="h-4 w-4 text-emerald-500" />
            <h2 className="text-[18px] font-extrabold tracking-tight text-headline">
              Most tracked products
            </h2>
            <Link
              href="/deals?sort=history"
              className="text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              see all →
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {latest.map((d) => (
              <Link
                key={d.listingId ?? `${d.slug}-${d.merchant}`}
                href={`/product/${d.slug}`}
                className="group overflow-hidden rounded-2xl border border-hairline bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                  <ProductThumb
                    imageUrl={d.imageUrl}
                    alt={d.title}
                    merchant={d.merchant}
                    sizes="(max-width: 640px) 50vw, 200px"
                    imageClassName="transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="mt-2 line-clamp-2 min-h-[2rem] text-[11.5px] font-bold leading-snug text-headline">
                  {d.title}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <StoreLogo merchant={d.merchant} size={14} />
                  <span className="tabular text-[13px] font-extrabold text-headline">
                    {formatINR(d.price)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-muted">
                  {d.observations} observations
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function Empty() {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-hairline bg-subtle p-10 text-center text-[13.5px] text-body">
      No all-time lows recorded yet.
    </div>
  );
}
