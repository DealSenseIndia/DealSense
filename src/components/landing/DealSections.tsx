import Link from "next/link";
import { ArrowDown, Flame, Radio } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import type { DealRow } from "@/lib/db/deals";
import { cn, formatINR, timeAgo } from "@/lib/utils";

/**
 * "Deals moving now" — a live ticker of real, recently-recorded price drops.
 * We know the exact timestamp of every drop, so this is genuinely live.
 */
export function DealsMovingNow({ deals }: { deals: DealRow[] }) {
  if (!deals.length) return null;

  return (
    <section className="relative overflow-hidden border-y border-hairline bg-gradient-to-r from-emerald-50 via-card to-teal-50 py-10 dark:from-emerald-950/30 dark:via-card dark:to-teal-950/20">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
              <Radio className="h-3 w-3 animate-pulse" /> Live
            </span>
            <h2 className="text-[22px] font-extrabold tracking-tight text-headline sm:text-[26px]">
              Deals moving now
            </h2>
            <span className="hidden text-[13px] text-muted sm:inline">
              prices we recorded dropping, in the last few weeks
            </span>
          </div>
          <Link
            href="/deals"
            className="text-[13px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
          >
            See all →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {deals.slice(0, 14).map((d) => (
            <Link
              key={d.slug}
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
    <section className="py-14">
      <Container size="wide">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-widest text-red-500">
              <Flame className="h-3.5 w-3.5" /> Rare
            </p>
            <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.025em] text-headline sm:text-[32px]">
              At their all-time low
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-body">
              The current price is the lowest we have ever recorded for that product. Not a sticker
              discount — a real one.
            </p>
          </div>
          <Link
            href="/deals?sort=allTimeLow"
            className="text-[13px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
          >
            See all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {deals.slice(0, 12).map((d) => (
            <Link
              key={d.slug}
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

/** "Hot deals by price" — the budget-shopper buckets. */
export function PriceBuckets({
  buckets,
}: {
  buckets: { max: number; count: number; best: number }[];
}) {
  const active = buckets.filter((b) => b.count > 0);
  if (!active.length) return null;
  return (
    <section className="border-y border-hairline bg-subtle py-7">
      <Container size="wide">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="mr-1 text-[12px] font-extrabold uppercase tracking-wider text-muted">
            Under
          </span>
          {active.map((b) => (
            <Link
              key={b.max}
              href={`/deals?priceMax=${b.max}`}
              className="group inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-[12.5px] font-extrabold text-headline transition-all hover:-translate-y-0.5 hover:border-emerald-400/60"
            >
              ₹{b.max.toLocaleString("en-IN")}
              <span className="tabular rounded-full bg-elevated px-1.5 text-[10px] font-extrabold text-muted">
                {b.count}
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** "Best discounts by percentage". */
export function DiscountTiers({ tiers }: { tiers: { min: number; count: number }[] }) {
  const active = tiers.filter((t) => t.count > 0);
  if (!active.length) return null;
  return (
    <section className="py-7">
      <Container size="wide">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="mr-1 text-[12px] font-extrabold uppercase tracking-wider text-muted">
            Min off
          </span>
          {active.map((t) => (
            <Link
              key={t.min}
              href={`/deals?discountMin=${t.min}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-[12.5px] font-extrabold text-amber-700 transition-all hover:-translate-y-0.5 hover:bg-amber-500 hover:text-white dark:text-amber-300"
            >
              {t.min}%
              <span className="tabular rounded-full bg-card/70 px-1.5 text-[10px] font-extrabold">
                {t.count}
              </span>
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
                    key={d.slug}
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
