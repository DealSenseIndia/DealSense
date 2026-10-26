import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronRight, LineChart, TrendingDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { PriceSpark } from "@/components/ui/PriceSpark";
import { PriceHistoryPanel } from "@/components/analyzer/PriceHistoryPanel";
import { getAllTimeLows, getLatestDeals } from "@/lib/db/deals";
import { getHistorySpotlight } from "@/lib/db/spotlight";
import { findEvents } from "@/lib/engine/insights";
import { storeMeta } from "@/lib/config";
import { formatINR, timeAgo } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Price history",
  description:
    "Every price point DealSense has actually recorded — low, high, typical and the exact moment the price moved.",
  alternates: { canonical: "/price-history" },
};

export const dynamic = "force-dynamic";

export default async function PriceHistoryPage() {
  const [lows, latest, spotlight] = await Promise.all([
    getAllTimeLows(24),
    getLatestDeals(12),
    getHistorySpotlight(),
  ]);

  const events = spotlight ? findEvents(spotlight.history) : [];

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
              Every point on every line is a real recorded price — read from the store page
              by DealSense or imported from a public tracker and labelled.
            </p>
          </div>
          <PageSearch className="w-full max-w-md" placeholder="Search a product to see its history…" />
        </div>

        {/* ---- the featured, fully interactive line ---- */}
        {spotlight && spotlight.history.length > 1 ? (
          <div className="mt-8 rounded-3xl border border-hairline bg-card p-4 shadow-card sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap rounded-full bg-[var(--dw-green-surface)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--dw-green-mid)]">
                  Deepest record
                </span>
                <h2 className="text-[15px] font-extrabold tracking-tight text-headline sm:text-[16px]">
                  A real price line
                </h2>
              </div>
              <span className="hidden text-[11.5px] font-semibold text-muted sm:inline">
                Point anywhere on the chart to read that day.
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
              <div className="flex gap-3 rounded-2xl border border-hairline bg-subtle p-3 lg:block lg:p-3.5">
                <Link href={spotlight.href} className="group block w-[86px] shrink-0 self-start lg:w-full">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-hairline bg-card">
                    <ProductThumb
                      imageUrl={spotlight.imageUrl}
                      alt={spotlight.title}
                      merchant={spotlight.merchant}
                      sizes="(max-width: 1024px) 86px, 250px"
                      imageClassName="transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                </Link>

                <div className="min-w-0 flex-1 lg:mt-3">
                  <Link href={spotlight.href} className="group block">
                    <h3 className="line-clamp-2 text-[13px] font-extrabold leading-snug text-headline transition-colors group-hover:text-[var(--dw-green-mid)] lg:text-[13.5px]">
                      {spotlight.title}
                    </h3>
                  </Link>

                  <div className="mt-1 flex items-center gap-1.5">
                    <StoreLogo merchant={spotlight.merchant} size={14} />
                    <span className="text-[11px] font-bold text-body lg:text-[11.5px]">
                      {storeMeta(spotlight.merchant).name}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="tabular text-[21px] font-extrabold leading-none tracking-tight text-headline lg:text-[24px]">
                      {formatINR(spotlight.price)}
                    </span>
                    {spotlight.mrp ? (
                      <span className="tabular text-[11.5px] text-muted line-through">
                        {formatINR(spotlight.mrp)}
                      </span>
                    ) : null}
                    {spotlight.discountPct > 0 ? (
                      <span className="text-[11px] font-extrabold text-[var(--dw-green-mid)]">
                        {spotlight.discountPct}% off
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 hidden grid-cols-2 gap-2 lg:grid">
                    <div className="rounded-lg border border-hairline bg-card px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted">
                        Lowest ever
                      </div>
                      <div className="tabular mt-0.5 text-[13px] font-extrabold text-[var(--dw-green-mid)]">
                        {spotlight.low ? formatINR(spotlight.low.price) : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-hairline bg-card px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted">
                        On record
                      </div>
                      <div className="tabular mt-0.5 flex items-center gap-1 text-[13px] font-extrabold text-headline">
                        <CalendarDays className="h-3 w-3 text-muted" />
                        {spotlight.points} pts
                      </div>
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] leading-relaxed text-muted lg:mt-2.5 lg:text-[10.5px]">
                    {spotlight.points} pts · {spotlight.spanDays} days
                    {spotlight.lastDrop
                      ? ` · last drop ${formatINR(spotlight.lastDrop.amount)} ${timeAgo(spotlight.lastDrop.at)}`
                      : ""}
                  </p>

                  <Link
                    href={spotlight.href}
                    className="mt-2 hidden items-center gap-1 text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline lg:inline-flex"
                  >
                    Open the full analysis <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              <div className="min-w-0">
                <PriceHistoryPanel
                  series={[{ merchant: spotlight.merchant, points: spotlight.history }]}
                  events={events}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        ) : null}

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
                  <div className="mt-1.5 rounded-lg border border-hairline bg-subtle/70 px-1.5 py-1">
                    <PriceSpark series={d.spark} width={140} height={26} className="w-full" />
                  </div>
                  <div className="mt-1 text-[10px] font-semibold text-muted">
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
                <div className="mt-1.5 rounded-lg border border-hairline bg-subtle/70 px-1.5 py-1">
                  <PriceSpark series={d.spark} width={140} height={26} className="w-full" />
                </div>
                <div className="mt-1 text-[10px] font-semibold text-muted">
                  {d.observations} observations
                </div>
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-10 rounded-2xl border border-hairline bg-subtle px-4 py-3 text-[11.5px] leading-relaxed text-muted">
          Every chart is DealSense&apos;s own tracked price record. New points come from store
          readings across Amazon, Flipkart, Myntra, Nykaa and every other store we track, so each
          series keeps getting longer over time.
        </p>
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
