import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { AnalyzeClient } from "@/components/analyzer/AnalyzeClient";
import { StoreWordmarkRow } from "@/components/ui/StoreWordmark";
import { trackedStores } from "@/lib/config";

export const metadata: Metadata = {
  title: "Check a deal",
  description:
    "Paste a product link from Amazon, Flipkart, Myntra, Nykaa or another tracked store. DealSense verifies the live price, reads the real price history and gives you a plain buy / wait / avoid verdict.",
  alternates: { canonical: "/analyze" },
};

const STEPS = [
  { t: "Paste the link", s: "Any supported store's product URL." },
  { t: "We read the real page", s: "Live price, stock, seller and rating." },
  { t: "You get the verdict", s: "Buy, wait or avoid — with the history behind it." },
];

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <section className="relative py-10">
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="mb-7">
              <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[40px]">
                Check <span className="text-gradient-brand">any</span> deal
              </h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-body">
                Paste a product link and we&apos;ll read the live price, pull the real price history
                and tell you plainly whether to buy, wait or walk away.
              </p>
            </div>

            <AnalyzeClient initialUrl={url} />
          </div>

          {/* ---- right rail ---- */}
          <aside className="space-y-4 lg:pt-24">
            <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
              <h2 className="text-[13.5px] font-extrabold text-headline">How it works</h2>
              <ol className="mt-4 space-y-4">
                {STEPS.map((s, i) => (
                  <li key={s.t} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[11px] font-extrabold text-[var(--dw-green-mid)]">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-extrabold text-headline">{s.t}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-body">{s.s}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
              <h2 className="text-[13.5px] font-extrabold text-headline">We track</h2>
              <div className="mt-3">
                <StoreWordmarkRow
                  merchants={trackedStores.map((s) => s.key)}
                  height={22}
                />
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-muted">
                Every product we list has real recorded price history. We compare the stores
                side by side and tell you the cheapest place to buy.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] p-5">
              <h2 className="text-[13.5px] font-extrabold text-[var(--dw-green-mid)]">Our one rule</h2>
              <ul className="mt-3 space-y-1.5">
                {["No price we can’t verify", "No invented history", "No inflated discounts"].map((t) => (
                  <li key={t} className="flex items-center gap-2 text-[12.5px] font-semibold text-body">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[9px] font-black text-[var(--dw-green-mid)]">
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Container>
    </section>
  );
}
