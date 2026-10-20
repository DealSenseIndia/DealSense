import { Container } from "@/components/ui/Container";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** "How it works" — three honest steps. */
export function HowItWorks() {
  return (
    <section className="py-14">
      <Container>
        <div className="mb-7 text-center">
          <h2 className="text-[26px] font-extrabold tracking-[-0.025em] text-headline sm:text-[32px]">
            How DealSense works
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-[14.5px] leading-relaxed text-body">
            We read the store page, keep the price we saw, and compare every later price against
            that record. No models, no estimates.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Read the page",
              d: "We pull the price straight from the store's own product page — never from an ad or a cached listing.",
            },
            {
              n: "02",
              t: "Keep the record",
              d: "Every price we see is stored with its timestamp, so next month we know exactly what it cost.",
            },
            {
              n: "03",
              t: "Give a verdict",
              d: "Buy, Wait or Avoid — with the maths shown, the landed cost included.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-hairline bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50"
            >
              <div className="tabular text-[13px] font-black text-[var(--dw-green-mid)]">{s.n}</div>
              <h3 className="mt-2 text-[16px] font-extrabold text-headline">{s.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body">{s.d}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** FAQ — the questions people actually ask about a price tracker. */
export function Faq() {
  const items = [
    {
      q: "Is the price history real?",
      a: "Yes. Every point is a price we actually observed on a store page, with the date we saw it. We never model, interpolate or estimate a price we didn't read.",
    },
    {
      q: "How does the price-drop alert work?",
      a: "We re-check a tracked product on a schedule. When the price on the store falls below your target, we message you on Telegram.",
    },
    {
      q: "What is true landed cost?",
      a: "The price you actually pay: the listed price plus delivery and any bank or card offer that applies to you. We show the total, not the sticker.",
    },
    {
      q: "Does DealSense take paid placements?",
      a: "No. Products are ranked by our own deal score only. We never accept payment to move a product up the list.",
    },
    {
      q: "How do you make money?",
      a: "We earn an affiliate commission when you buy through a store link. It costs you nothing extra and it never changes how a product is scored or ranked.",
    },
  ];

  return (
    <section className="border-t border-hairline py-14" id="faq">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-[26px] font-extrabold tracking-[-0.025em] text-headline sm:text-[32px]">
              Questions, answered
            </h2>
            <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-body">
              If something here is not true for you, tell us and we will fix it.
            </p>
            <Link
              href="/analyze"
              className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              Analyze a product <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-hairline">
            {items.map((i) => (
              <details key={i.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-extrabold text-headline marker:hidden">
                  {i.q}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-body">{i.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
