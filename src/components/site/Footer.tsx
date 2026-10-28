import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { StoreWordmark } from "@/components/ui/StoreWordmark";
import { trackedStores } from "@/lib/config";

const STORES = trackedStores.map((s) => s.key);
const STORE_NAMES = trackedStores.map((s) => s.name);

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/setups", label: "Build a Smart Setup" },
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
      { href: "/blog", label: "The DealSense journal" },
      { href: "/live", label: "Live price drops" },
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
              India&apos;s shopping decision engine. Every price in our record is dated, so we
              can tell you whether now is a good time to buy.
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

        {/* what we track — the real store marks, in one clean row */}
        <div className="mt-10 rounded-2xl bg-white px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="shrink-0">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                We track
              </div>
              <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-slate-600">
                Price history across {STORE_NAMES.slice(0, -1).join(", ")} and{" "}
                {STORE_NAMES[STORE_NAMES.length - 1]} — compared side by side, with free
                price-drop alerts.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
              {STORES.map((s) => (
                <StoreWordmark key={s} merchant={s} height={24} className="opacity-90" />
              ))}
            </div>
          </div>
        </div>

        {/* disclosure */}
        <div className="mt-10 border-y border-white/[0.08] py-5 text-[12px] leading-relaxed text-slate-500">
          <strong className="text-slate-400">Affiliate &amp; Trust Disclosure:</strong> As an Amazon
          Associate and a Flipkart affiliate, DealSense may earn a commission when you buy through
          a store link. It costs you nothing extra, and it never changes our deal scores or the
          order products are ranked in. We do not sell placement and we do not accept payment for
          reviews. Prices shown are what the store listed when they were recorded — always confirm
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
