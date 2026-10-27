import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Radar, ShieldCheck, TimerOff } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { LiveFeed } from "@/components/live/LiveFeed";
import { getLiveDeals } from "@/lib/live";
import { site } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Live price drops, verified minutes ago",
  description:
    "The deals DealSense has re-checked in the last twenty minutes: at or near their own recorded low, in stock, and gone the moment the price moves.",
  alternates: { canonical: `${site.url}/live` },
};

export default async function LivePage() {
  const deals = await getLiveDeals(30).catch(() => []);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      { "@type": "ListItem", position: 2, name: "Live drops", item: `${site.url}/live` },
    ],
  };

  return (
    <div className="pb-16">
      <Container size="wide" className="pt-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
          <Link href="/" className="hover:text-headline">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-headline">Live drops</span>
        </nav>

        <header className="mt-5 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-[var(--dw-green-surface)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--dw-green-mid)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live · re-checked every few minutes
          </span>
          <h1 className="mt-3 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-headline sm:text-[42px]">
            Drops we verified, not drops we heard about
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-body">
            Every card here was re-priced from the store we track in the last twenty minutes. It is at
            or near its own recorded low, or at least a tenth under its own average. When the price
            moves or the listing goes out of stock, the card disappears — there is nothing to catch
            up on.
          </p>
        </header>

        <div className="mt-7">
          <LiveFeed initial={deals} />
        </div>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <Explain
            icon={<Radar className="h-4 w-4" />}
            title="Found"
            body="A drop shows up in our own price record, or arrives as a lead from a reader or a public deal post. A lead is only a pointer to a product."
          />
          <Explain
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Checked"
            body="We fetch the price and stock ourselves and compare them with at least four recorded points. If the numbers do not hold, it never appears."
          />
          <Explain
            icon={<TimerOff className="h-4 w-4" />}
            title="Expires"
            body="No invented countdowns. A clock appears only when the store states an end time; otherwise the card says when it was last checked and leaves on its own."
          />
        </section>

        <div className="mt-8 rounded-2xl border border-hairline bg-card p-5">
          <h2 className="text-[15px] font-extrabold text-headline">Why this is not a deal aggregator</h2>
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-body">
            Aggregated feeds are fast because nobody checks them. We would rather show twelve deals we
            can stand behind than two hundred we cannot — so the list can be short, and an empty list
            is a truthful answer, not a bug.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/deals"
              className="inline-flex h-9 items-center rounded-xl border border-hairline bg-subtle px-3.5 text-[12px] font-extrabold text-secondary hover:text-headline"
            >
              Every tracked deal
            </Link>
            <Link
              href="/price-history"
              className="inline-flex h-9 items-center rounded-xl border border-hairline bg-subtle px-3.5 text-[12px] font-extrabold text-secondary hover:text-headline"
            >
              How the history works
            </Link>
          </div>
        </div>
      </Container>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </div>
  );
}

function Explain({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
        {icon}
        {title}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">{body}</p>
    </div>
  );
}
