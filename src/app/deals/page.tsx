import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { DealCard } from "@/components/deals/DealCard";
import { UrlForm } from "@/components/analyzer/UrlForm";
import { getLiveDeals } from "@/lib/engine/deals";

export const metadata: Metadata = {
  title: "Live deals",
  description:
    "Real, verified price drops across Amazon India and Flipkart — scored by DealSense. No fake discounts.",
  alternates: { canonical: "/deals" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DealsPage() {
  const deals = await getLiveDeals(48);
  const good = deals.filter((d) => d.verdict.verdict === "BUY");

  return (
    <section className="relative py-14 sm:py-20">
      <Container size="wide">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Live deals</h1>
            <p className="mt-2 max-w-xl text-ink-soft">
              A window into the DealSense engine. Every card is a real, timestamped price
              observation — ranked by how genuinely good the deal is.
            </p>
          </div>
          <div className="text-sm text-ink-muted">
            <span className="tabular font-bold text-ink">{deals.length}</span> verified listings ·{" "}
            <span className="tabular font-bold text-emerald-300">{good.length}</span> buy-worthy
          </div>
        </div>

        {deals.length === 0 ? (
          <div className="mt-14 rounded-3xl border border-line bg-surface p-12 text-center backdrop-blur-xl">
            <div className="text-4xl">🌱</div>
            <h2 className="mt-4 text-xl font-bold">The engine is warming up</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              DealSense shows only real, verified observations — so the feed stays empty until we have
              genuine data. Analyze a product to add the first real price points.
            </p>
            <div className="mx-auto mt-7 max-w-xl">
              <UrlForm size="md" />
            </div>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {deals.map((deal) => (
              <DealCard key={deal.listingId} deal={deal} />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
