import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronRight, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { buildSetupCached } from "@/lib/setups/cached";
import { getSetupSpace, isSetupSpace, listSetupSpaces } from "@/lib/setups/blueprints";
import { budgetVariants, setupHref } from "@/lib/setups/seo";
import { site } from "@/lib/config";
import { formatINR } from "@/lib/utils";

/**
 * The indexable room guide: /setups/gaming and /setups/gaming/125000.
 *
 * The builder at /setups is interactive and lives on query strings, which
 * search engines treat as one page. This route renders the same build as a
 * plain, server-rendered page with stable URLs, per-item links into the price
 * history, and structured data — the actual content people search for
 * ("gaming setup under 1 lakh").
 */

export const revalidate = 1800;
export const dynamicParams = true;

type Params = { space: string; budget?: string[] };

function resolve(params: Params) {
  if (!isSetupSpace(params.space)) return null;
  const space = getSetupSpace(params.space);
  let budget = space.budgetDefault;
  if (params.budget?.length) {
    if (params.budget.length !== 1 || !/^\d{3,7}$/.test(params.budget[0])) return null;
    budget = Number(params.budget[0]);
    if (budget < space.budgetMin || budget > space.budgetMax) return null;
  }
  return { space, budget };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = resolve(await params);
  if (!found) return { title: "Setup not found" };
  const { space, budget } = found;
  const path = setupHref(space.key, budget);
  const title = `${space.title} under ${formatINR(budget)} — every part, priced`;
  const description = `${space.tagline} A complete ${space.title.toLowerCase()} at ${formatINR(
    budget,
  )}, built only from listings DealSense tracks — with the recorded price history behind every part.`;
  return {
    title,
    description,
    alternates: { canonical: `${site.url}${path}` },
    openGraph: { title, description, url: `${site.url}${path}`, type: "article" },
  };
}

const REASON_LABEL: Record<string, string> = {
  NO_MATCHING_PRODUCT: "Not tracked yet",
  OUT_OF_BUDGET_RANGE: "No match in this price band",
  ONLY_POOR_DEALS: "Only poor deals right now",
};

export default async function SetupGuidePage({ params }: { params: Promise<Params> }) {
  const found = resolve(await params);
  if (!found) notFound();
  const { space, budget } = found;

  const built = await buildSetupCached(space.key, budget, "no_preference", []);
  const tier = built.tiers.find((t) => t.key === "value") ?? built.tiers[0];
  const essentials = tier.items.filter((i) => i.phase === 1);
  const extras = tier.items.filter((i) => i.phase === 2);
  const open = tier.unfilled.filter((u) => u.reason !== "COVERED_BY_PROCESSOR");
  const path = setupHref(space.key, budget);
  const variants = budgetVariants(space.key).filter((b) => b !== budget);
  const others = listSetupSpaces().filter((s) => s.key !== space.key);

  const faqs = [
    {
      q: `Is this a complete ${space.title.toLowerCase()}?`,
      a: `It fills ${tier.items.length} of ${space.slots.length} functional slots with a tracked listing. ${
        open.length
          ? `The ${open.length} still open ${open.length === 1 ? "is" : "are"} listed with the reason — usually that no listing we track fits this price.`
          : "Every slot is filled at this budget."
      }`,
    },
    {
      q: "How are the prices kept honest?",
      a: "Every item is a real listing with recorded price points, not a catalogue estimate. Each product page shows the date of its newest recorded price, the all-time low and how the current price compares with its own history.",
    },
    {
      q: `Can I build this at a different budget?`,
      a: `Yes. The room builder accepts any budget between ${formatINR(space.budgetMin)} and ${formatINR(
        space.budgetMax,
      )}, and it shows three tiers — budget saver, best value and step up — around whatever number you choose.`,
    },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${space.title} under ${formatINR(budget)}`,
    numberOfItems: tier.items.length,
    itemListElement: tier.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: `${site.url}/product/${item.slug}`,
    })),
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      { "@type": "ListItem", position: 2, name: "Smart Setups", item: `${site.url}/setups` },
      { "@type": "ListItem", position: 3, name: space.title, item: `${site.url}${setupHref(space.key)}` },
      ...(budget === space.budgetDefault
        ? []
        : [{ "@type": "ListItem", position: 4, name: `Under ${formatINR(budget)}`, item: `${site.url}${path}` }]),
    ],
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const json = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

  return (
    <div className="pb-16">
      <Container size="wide" className="pt-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted">
          <Link href="/" className="hover:text-headline">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/setups" className="hover:text-headline">Smart Setups</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={setupHref(space.key)} className="hover:text-headline">{space.title}</Link>
          {budget !== space.budgetDefault && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-headline">Under {formatINR(budget)}</span>
            </>
          )}
        </nav>

        <header className="mt-5 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
            <Sparkles className="h-3.5 w-3.5" /> Smart Setups · room guide
          </span>
          <h1 className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-headline sm:text-[42px]">
            {space.title} under {formatINR(budget)}
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-body">{space.description}</p>
        </header>

        <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Plan total" value={formatINR(tier.totalPrice)} note={`target ${formatINR(budget)}`} />
          <Stat label="Tracked picks" value={String(tier.items.length)} note={`${tier.storeCount} stores`} />
          <Stat
            label="Open slots"
            value={String(open.length)}
            note={open.length ? "with reasons below" : "all filled"}
          />
          <Stat label="Setup score" value={tier.setupScore != null ? `${tier.setupScore}/100` : "—"} note="coverage, budget, evidence" />
        </dl>

        <section className="mt-9">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-headline">The build</h2>
          <p className="mt-1 text-[13px] text-secondary">
            Each row is a listing we track. Percentages against list price are recorded discounts, not
            seasonal claims.
          </p>
          <ItemGroup title={`Essentials · ${essentials.length}`} items={essentials} />
          {extras.length > 0 && <ItemGroup title={`Finishing touches · ${extras.length}`} items={extras} />}
        </section>

        {open.length > 0 && (
          <section className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              <h2 className="text-[13px] font-extrabold text-amber-800 dark:text-amber-200">
                {open.length} {open.length === 1 ? "slot was" : "slots were"} left unfilled — not estimated
              </h2>
            </div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {open.map((u) => (
                <li key={u.slotKey} className="rounded-lg border border-hairline bg-card/80 px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-headline">{u.slotLabel}</span>
                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      {REASON_LABEL[u.reason] ?? u.reason}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-muted">{u.detail}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {built.tiers.map((t) => (
            <Link
              key={t.key}
              href={`/setups?space=${space.key}&budget=${budget}&tier=${t.key}`}
              className="rounded-2xl border border-hairline bg-card p-4 shadow-card transition-colors hover:border-hairline-strong"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">{t.label}</div>
              <div className="mt-1 text-[20px] font-extrabold text-headline">{formatINR(t.totalPrice)}</div>
              <div className="mt-0.5 text-[11px] text-secondary">
                {t.items.length} picks · {t.unfilled.filter((u) => u.reason !== "COVERED_BY_PROCESSOR").length} open
              </div>
              <div className="mt-2 text-[11px] font-bold text-[var(--dw-green-mid)]">Open in the builder →</div>
            </Link>
          ))}
        </section>

        <section className="mt-9">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-headline">Questions this page answers</h2>
          <div className="mt-3 space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className="rounded-xl border border-hairline bg-card px-4 py-3">
                <summary className="cursor-pointer text-[13px] font-extrabold text-headline">{f.q}</summary>
                <p className="mt-2 text-[12.5px] leading-relaxed text-body">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {(variants.length > 0 || others.length > 0) && (
          <section className="mt-9 grid gap-6 sm:grid-cols-2">
            {variants.length > 0 && (
              <div>
                <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-secondary">Same room, other budgets</h2>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {variants.map((b) => (
                    <li key={b}>
                      <Link
                        href={setupHref(space.key, b)}
                        className="inline-flex rounded-full border border-hairline bg-card px-3 py-1.5 text-[11.5px] font-bold text-secondary hover:border-hairline-strong hover:text-headline"
                      >
                        Under {formatINR(b)}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href={`/setups?space=${space.key}`}
                      className="inline-flex rounded-full border border-hairline bg-card px-3 py-1.5 text-[11.5px] font-bold text-secondary hover:border-hairline-strong hover:text-headline"
                    >
                      Any budget →
                    </Link>
                  </li>
                </ul>
              </div>
            )}
            <div>
              <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-secondary">Other rooms</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {others.map((s) => (
                  <li key={s.key}>
                    <Link
                      href={`/setups/${s.key}`}
                      className="inline-flex rounded-full border border-hairline bg-card px-2.5 py-1.5 text-[11px] font-semibold text-secondary hover:border-hairline-strong hover:text-headline"
                    >
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <div className="mt-9 rounded-2xl border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] p-5">
          <h2 className="text-[15px] font-extrabold text-headline">Build it with your own numbers</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">
            Tick what you already own, pick a design direction, and the same engine re-prices the room
            against your budget — {formatINR(space.budgetMin)} to {formatINR(space.budgetMax)}.
          </p>
          <Link
            href={`/setups?space=${space.key}&budget=${budget}`}
            className="btn-cta mt-3 inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12.5px] font-extrabold"
          >
            Open the {space.title.toLowerCase()} builder
          </Link>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-muted">
          Prices are the newest recorded readings for each listing, kept current by an automated sync.
          Every product page names the date of its latest price and the store it came from. DealSense
          earns a commission when you buy through its links; the ranking does not depend on it.
        </p>
      </Container>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(itemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(breadcrumbs) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(faqLd) }} />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-card px-3 py-2.5">
      <dt className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[18px] font-extrabold text-headline">{value}</dd>
      <dd className="text-[10px] text-muted">{note}</dd>
    </div>
  );
}

function ItemGroup({
  title,
  items,
}: {
  title: string;
  items: Awaited<ReturnType<typeof buildSetupCached>>["tiers"][number]["items"];
}) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">{title}</h3>
      <ul className="mt-2 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-2xl border border-hairline bg-card">
        {items.map((item) => (
          <li key={item.listingId}>
            <Link href={`/product/${item.slug}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-elevated">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-hairline bg-subtle">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-contain p-1" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-muted">{item.slotLabel}</div>
                <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-headline">{item.title}</div>
                <div className="mt-0.5 text-[10px] text-muted">
                  {item.merchantName} · {item.observationCount} recorded price points
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[14px] font-extrabold text-headline">{formatINR(item.price)}</div>
                {item.mrp && item.mrp > item.price ? (
                  <div className="text-[10px] text-muted line-through">{formatINR(item.mrp)}</div>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
