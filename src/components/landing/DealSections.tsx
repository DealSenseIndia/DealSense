import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { StoreCompareBadge } from "@/components/ui/StoreCompareBadge";
import type { DealRow } from "@/lib/db/deals";
import { cn, formatINR, timeAgo } from "@/lib/utils";

/**
 * "Today's Biggest Price Drops" — the DealSense 1.0 feed header, with real
 * filter pills that point at the live /deals filters.
 */
export function DealsMovingNow({
  deals,
  filters,
}: {
  deals: DealRow[];
  filters: { label: string; href: string; count?: number }[];
}) {
  if (!deals.length) return null;

  return (
    <section className="py-12" id="liveDeals">
      <Container size="wide">
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-headline">
              Today&apos;s Biggest Price Drops
            </h2>
            <p className="max-w-[650px] text-[14.5px] leading-[1.5] text-body">
              Real price drops, checked against historical prices — not just the discount printed
              on the product page.
            </p>
          </div>
          <Link
            href="/deals"
            className="text-[13.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
          >
            View all deals →
          </Link>
        </div>

        {/* filter pills */}
        {filters.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {filters.map((f) => (
              <Link
                key={f.label}
                href={f.href}
                className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border border-hairline bg-card px-4 py-2 text-[13px] font-semibold text-body transition-all hover:-translate-y-px hover:border-[var(--dw-green-mid)] hover:text-headline"
              >
                {f.label}
                {f.count !== undefined ? (
                  <span className="tabular rounded-full bg-subtle px-1.5 text-[10px] font-semibold text-secondary">
                    {f.count}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {deals.slice(0, 14).map((d) => (
            <Link
              key={`${d.slug}-${d.merchant}`}
              href={`/product/${d.slug}`}
              className="group overflow-hidden rounded-2xl border border-hairline bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.55)]"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                <ProductThumb
                  imageUrl={d.imageUrl}
                  alt={d.title}
                  merchant={d.merchant}
                  sizes="(max-width: 640px) 50vw, 180px"
                  imageClassName="transition-transform duration-500 group-hover:scale-105"
                />
                {d.dropAmount ? (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                    <ArrowDown className="h-2.5 w-2.5" />₹{d.dropAmount.toLocaleString("en-IN")}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-snug text-headline">
                {d.title}
              </div>
              <div className="mt-1">
                <Rating rating={d.rating} reviewCount={d.reviewCount} />
              </div>
              {d.stores > 1 ? (
                <div className="mt-1">
                  <StoreCompareBadge
                    stores={d.stores}
                    bestStore={d.bestStore}
                    saving={d.storeSaving}
                    compact
                  />
                </div>
              ) : null}
              <div className="mt-1.5 flex items-center gap-1.5">
                <StoreLogo merchant={d.merchant} size={15} />
                <span className="tabular text-[12.5px] font-extrabold text-headline">
                  {formatINR(d.price)}
                </span>
              </div>
              {d.lastDropAt && (
                <div className="mt-0.5 text-[10px] font-semibold text-muted">
                  dropped {timeAgo(d.lastDropAt)}
                </div>
              )}
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** "Today's all-time lows" — real lows computed from recorded history. */
export function AllTimeLows({ deals }: { deals: DealRow[] }) {
  if (!deals.length) return null;
  return (
    <section className="py-12">
      <Container size="wide">
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-headline">
              At their all-time low
            </h2>
            <p className="max-w-[650px] text-[14.5px] leading-[1.5] text-body">
              The current price is the lowest we have ever recorded for that product. Not a sticker
              discount — a real one.
            </p>
          </div>
          <Link
            href="/deals?sort=allTimeLow"
            className="text-[13.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
          >
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {deals.slice(0, 12).map((d) => (
            <Link
              key={`${d.slug}-${d.merchant}`}
              href={`/product/${d.slug}`}
              className="group overflow-hidden rounded-2xl border-2 border-red-400/40 bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-red-400"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                <ProductThumb
                  imageUrl={d.imageUrl}
                  alt={d.title}
                  merchant={d.merchant}
                  sizes="(max-width: 640px) 50vw, 200px"
                  imageClassName="transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-white">
                  All-time low
                </span>
              </div>
              <div className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-snug text-headline">
                {d.title}
              </div>
              <div className="tabular mt-1.5 text-[15px] font-extrabold text-headline">
                {formatINR(d.price)}
              </div>
              <div className="mt-0.5 text-[10px] font-bold text-muted">
                {d.observations} points tracked
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** "Top deals by platform" — one row per store. */
export function PlatformShelves({
  shelves,
}: {
  shelves: { merchant: string; meta: { name: string; short: string; color: string }; deals: DealRow[] }[];
}) {
  if (!shelves.length) return null;
  return (
    <section className="py-8">
      <Container size="wide">
        <div className="space-y-8">
          {shelves.map((s) => (
            <div key={s.merchant}>
              <div className="mb-3 flex items-center gap-2">
                <StoreLogo merchant={s.merchant} size={22} />
                <span className="text-[14px] font-extrabold text-headline">{s.meta.name}</span>
                <Link
                  href={`/deals?store=${s.merchant}`}
                  className="text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
                >
                  view all →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {s.deals.map((d) => (
                  <Link
                    key={`${d.slug}-${d.merchant}`}
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
                      {d.discountPct > 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8.5px] font-extrabold text-white">
                          {d.discountPct}%
                        </span>
                      )}
                    </div>
                    <div className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-snug text-headline">
                      {d.title}
                    </div>
                    <div className="tabular mt-1.5 text-[13px] font-extrabold text-headline">
                      {formatINR(d.price)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
