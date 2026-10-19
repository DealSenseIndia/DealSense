import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getLiveDeals } from "@/lib/engine/deals";
import { formatINR } from "@/lib/utils";
import { Tag } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Price history",
  description:
    "Explore verified price history for products across Amazon India and Flipkart. Real observations, real low, real verdict.",
  alternates: { canonical: "/price-history" },
};

export const dynamic = "force-dynamic";

export default async function PriceHistoryPage() {
  const deals = await getLiveDeals(60);
  const withHistory = deals.filter((d) => d.verdict.stats.count > 0);

  return (
    <section className="relative py-12">
      <Container size="wide">
        <div className="max-w-2xl">
          <h1 className="text-[30px] font-extrabold tracking-tight text-headline sm:text-[36px]">
            Price history, honestly recorded
          </h1>
          <p className="mt-2 text-[14.5px] text-body">
            Every point on every chart is a real observation DealSense made on a merchant page. No
            estimated history, no invented curves.
          </p>
        </div>

        {withHistory.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-hairline bg-subtle p-12 text-center">
            <p className="text-[14px] text-body">
              No recorded history yet. Analyze a product to start building the record.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {withHistory.map((d) => {
              const stats = d.verdict.stats;
              const drop =
                stats.high !== null && stats.low !== null && stats.high > stats.low
                  ? Math.round(((stats.high - stats.low) / stats.high) * 100)
                  : null;
              return (
                <Link
                  key={d.listingId}
                  href={`/product/${d.slug}`}
                  className="group rounded-card border border-hairline bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-accent/40 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-2 text-[14px] font-extrabold leading-snug text-headline group-hover:text-[var(--dw-green-mid)]">
                      {d.title}
                    </h2>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="tabular mt-3 text-[22px] font-extrabold tracking-tight text-headline">
                    {formatINR(d.price)}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
                    <div>
                      <div className="tabular text-[13px] font-extrabold text-[var(--dw-green-mid)]">
                        {formatINR(stats.low)}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Low</div>
                    </div>
                    <div>
                      <div className="tabular text-[13px] font-extrabold text-headline">
                        {formatINR(stats.median)}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Typical</div>
                    </div>
                    <div>
                      <div className="tabular text-[13px] font-extrabold text-headline">
                        {formatINR(stats.high)}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">High</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Tag tone="brand">{stats.count} observations</Tag>
                    {drop !== null && (
                      <Tag tone="amber">
                        <TrendingDown className="h-2.5 w-2.5" /> {drop}% spread
                      </Tag>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
