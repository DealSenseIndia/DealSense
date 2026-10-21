import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";

const STORES = ["amazon", "flipkart", "myntra", "tatacliq"];

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/deals?sort=drop", label: "Live price drops" },
      { href: "/deals?sort=allTimeLow", label: "All-time lows" },
      { href: "/deals?multiStore=1", label: "Compare across stores" },
      { href: "/price-history", label: "Price history" },
      { href: "/categories", label: "All categories" },
    ],
  },
  {
    title: "Track",
    links: [
      { href: "/analyze", label: "Analyze a link" },
      { href: "/track", label: "Your alerts" },
      { href: "/search", label: "Search products" },
      { href: "/deals?priceMax=9999", label: "Deals under ₹9,999" },
      { href: "/deals?discountMin=50", label: "50% off and more" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#how-it-works", label: "How DealSense works" },
      { href: "/#faq", label: "Questions, answered" },
      { href: "/price-history", label: "How we track prices" },
      { href: "/disclosure", label: "Affiliate disclosure" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-hairline bg-[linear-gradient(180deg,#061A12_0%,#030D09_100%)] text-slate-400">
      <Container size="wide" className="py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          {/* brand */}
          <div>
            <div className="flex items-center gap-2.5">
              <Image
                src="/brand/dealsense-icon.png"
                alt="DealSense"
                width={30}
                height={30}
                className="h-[30px] w-[30px] object-contain"
                style={{ filter: "drop-shadow(0 0 10px rgba(16,185,129,0.45))" }}
              />
              <span className="text-[19px] font-extrabold tracking-[-0.02em] text-slate-50">
                DealSense
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed">
              India&apos;s shopping decision engine. We read the price straight off the store,
              keep every price we see, and tell you whether now is a good time to buy.
            </p>

            <div className="mt-5 flex items-center gap-2">
              {STORES.map((s) => (
                <span
                  key={s}
                  title={s}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06]"
                >
                  <StoreLogo merchant={s} size={20} />
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px]">
              We track these stores and compare them side by side.
            </p>
          </div>

          {/* link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-slate-50">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] transition-all hover:translate-x-1 hover:text-emerald-400"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* disclosure */}
        <div className="mt-10 border-y border-white/[0.08] py-5 text-[12px] leading-relaxed text-slate-500">
          <strong className="text-slate-400">Affiliate &amp; Trust Disclosure:</strong> As an Amazon
          Associate and a Flipkart affiliate, DealSense may earn a commission when you buy through
          a store link. It costs you nothing extra, and it never changes our deal scores or the
          order products are ranked in. We do not sell placement and we do not accept payment for
          reviews. Prices shown are what the store listed when we recorded them — always confirm
          at checkout.
        </div>

        {/* bottom bar */}
        <div className="flex flex-col gap-3 pt-6 text-[12.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DealSense. Made in India for Indian shoppers.</p>
          <div className="flex items-center gap-4">
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
