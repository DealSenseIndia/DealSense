import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";

const STORES = ["amazon", "flipkart", "myntra", "tatacliq"];

export function Footer() {
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-[rgba(16,185,129,0.25)] bg-[linear-gradient(180deg,#061A12_0%,#030D09_100%)] text-[13.5px] text-slate-400">
      {/* ambient emerald glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[200px] w-[700px] -translate-x-1/2"
        style={{
          background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)",
        }}
      />

      {/* ---- 1. method ribbon (true by construction, never drifts) ---- */}
      <div className="relative z-[2] border-y border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.06)] py-6">
        <Container size="wide">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <Stat value="Amazon · Flipkart · Myntra" label="Stores we track" />
            <Sep />
            <Stat value="Observed, never estimated" label="Where prices come from" />
            <Sep />
            <Stat value="Inflated MRP flagged" label="Discount honesty" badge="Audited" />
            <Sep />
            <Stat value="No paid placements" label="Ranked by deal score only" />
          </div>
        </Container>
      </div>

      {/* ---- 2. navigation grid ---- */}
      <Container size="wide" className="relative z-[2] pb-7 pt-14">
        <div className="grid gap-9 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr]">
          {/* brand */}
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/brand/dealsense-icon.png"
                alt="DealSense"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                style={{ filter: "drop-shadow(0 0 10px rgba(16,185,129,0.5))" }}
              />
              <span className="text-[20px] font-black tracking-[-0.02em] text-slate-50">
                DealSense
              </span>
            </div>
            <p className="mt-3 max-w-sm text-[13.5px] leading-[1.6] text-slate-400">
              India&apos;s shopping decision engine. Real price history, true landed cost and an
              honest verdict — before you buy.
            </p>

            <div className="mt-5 flex items-center gap-2.5">
              {STORES.map((s) => (
                <span
                  key={s}
                  title={s}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06]"
                >
                  <StoreLogo merchant={s} size={22} />
                </span>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-slate-500">
              We track these stores and compare them side by side.
            </p>
          </div>

          <FooterCol
            title="Explore"
            links={[
              { href: "/deals?sort=drop", label: "Live Price Drops" },
              { href: "/deals?sort=allTimeLow", label: "All-Time Lows" },
              { href: "/price-history", label: "Price History" },
              { href: "/categories", label: "Browse Categories" },
              { href: "/deals?priceMax=9999", label: "Deals Under ₹9,999" },
            ]}
          />
          <FooterCol
            title="Tools"
            links={[
              { href: "/analyze", label: "Analyze a Link" },
              { href: "/search", label: "Search Products" },
              { href: "/track", label: "Your Alerts" },
              { href: "/deals?store=amazon", label: "Amazon Price Tracker" },
              { href: "/deals?store=flipkart", label: "Flipkart Price Tracker" },
            ]}
          />

          {/* how it works */}
          <div>
            <h4 className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-slate-50">
              How DealSense Works
            </h4>
            <ol className="mt-4 space-y-3">
              {[
                ["Read the page", "We pull the price straight from the store, never from an ad."],
                ["Check the history", "We compare it against every price we recorded before."],
                ["Give you a verdict", "Buy, Wait or Avoid — with the maths shown."],
              ].map(([t, s], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-black text-emerald-400">
                    {i + 1}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-bold text-slate-100">{t}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-400">{s}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href="/analyze"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-[12.5px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-white"
            >
              Paste a product link →
            </Link>
          </div>
        </div>

        {/* ---- 3. affiliate disclosure ---- */}
        <div className="mt-10 border-y border-white/[0.08] py-5 text-[12px] leading-[1.6] text-slate-500">
          <strong className="text-slate-400">Affiliate &amp; Trust Disclosure:</strong> As an Amazon
          Associate and a Flipkart affiliate, DealSense may earn a commission when you buy through
          a store link. This never affects our deal scores or the order products are ranked in. We
          do not sell placement and we do not accept payment for reviews. Prices shown are the
          price on the store page at the time we recorded it — always confirm at checkout.
        </div>

        {/* ---- 4. bottom bar ---- */}
        <div className="flex flex-col gap-3 pt-5 text-[12.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DealSense. Made in India for Indian shoppers.</p>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="transition-colors hover:text-emerald-400">
              Privacy
            </Link>
            <span className="text-white/15">•</span>
            <Link href="/disclosure" className="transition-colors hover:text-emerald-400">
              Affiliate disclosure
            </Link>
            <span className="text-white/15">•</span>
            <Link href="/analyze" className="transition-colors hover:text-emerald-400">
              Track a product
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

function Stat({ value, label, badge }: { value: string; label: string; badge?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 text-center">
      <div className="flex items-center justify-center gap-2">
        <span className="text-[16px] font-extrabold leading-[1.3] text-slate-50">{value}</span>
        {badge ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">
            {badge}
          </span>
        ) : null}
      </div>
      <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-emerald-400">
        {label}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="hidden h-10 w-px shrink-0 bg-white/10 lg:block" />;
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h4 className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-slate-50">
        {title}
      </h4>
      <ul className="mt-4 space-y-[11px]">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="inline-block text-[13.5px] text-slate-400 transition-all hover:translate-x-1 hover:text-emerald-400"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
