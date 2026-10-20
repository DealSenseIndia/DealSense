import Link from "next/link";
import { Bell, Circle, History, LayoutGrid, ShieldCheck, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

/**
 * Trust strip (5 pillars) — the DealSense 1.0 proof bar, with our real numbers.
 */
export function TrustStrip({
  productsTracked = 0,
  pointsTracked = 0,
  storesCompared = 0,
  storeNames = "Amazon, Flipkart, Myntra",
}: {
  productsTracked?: number;
  pointsTracked?: number;
  storesCompared?: number;
  storeNames?: string;
}) {
  const pillars = [
    {
      val: `${productsTracked.toLocaleString("en-IN")}+ Products`,
      lbl: "Tracked across India's top stores",
      icon: <ShieldCheck className="h-5 w-5" />,
      cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      val: "Real Price History",
      lbl: `${pointsTracked.toLocaleString("en-IN")} verified observations`,
      icon: <Circle className="h-5 w-5" />,
      cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    {
      val: "Deal Authenticity Score",
      lbl: "Avoid fake sales & inflated MRPs",
      icon: <History className="h-5 w-5" />,
      cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      val: `${storesCompared} Store Comparison`,
      lbl: storeNames,
      icon: <Store className="h-5 w-5" />,
      cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    {
      val: "Instant Price Alerts",
      lbl: "WhatsApp & Telegram drop radar",
      icon: <Bell className="h-5 w-5" />,
      cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <section className="border-y border-hairline bg-subtle">
      <Container size="wide">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 py-6 sm:grid-cols-2 lg:grid-cols-5">
          {pillars.map((p) => (
            <div key={p.val} className="flex items-center gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", p.cls)}>
                {p.icon}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-extrabold text-headline">{p.val}</span>
                <span className="mt-0.5 block text-[11.5px] text-muted">{p.lbl}</span>
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/**
 * Category quick-navigation strip (Buyhatke square inspiration) — replaces the
 * old "Popular:" chips with something actually useful.
 */
export function CategoryNavStrip({
  items,
}: {
  items: { name: string; emoji: string; drops: number; tracked: number; href: string }[];
}) {
  if (!items.length) return null;
  return (
    <section className="relative border-b border-hairline py-5">
      <Container size="wide">
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="group flex min-w-[186px] shrink-0 items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-lift"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[19px]">
                {c.emoji}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13.5px] font-extrabold text-headline">
                  {c.name}
                </span>
                <span className="mt-0.5 block text-[11.5px] font-bold text-[var(--dw-green-mid)]">
                  {c.drops > 0
                    ? `${c.drops} Drop${c.drops === 1 ? "" : "s"} Today`
                    : `${c.tracked} product${c.tracked === 1 ? "" : "s"} tracked`}
                </span>
              </span>
            </Link>
          ))}
          <Link
            href="/categories"
            className="group flex min-w-[186px] shrink-0 items-center gap-3 rounded-2xl border border-dashed border-emerald-500/40 bg-[var(--dw-green-surface)] px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-emerald-500"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-[var(--dw-green-mid)]">
              <LayoutGrid className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13.5px] font-extrabold text-headline">
                All Categories
              </span>
              <span className="mt-0.5 block text-[11.5px] font-bold text-[var(--dw-green-mid)]">
                Browse the full catalogue
              </span>
            </span>
          </Link>
        </div>
      </Container>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-20 bg-gradient-to-l from-[var(--bg-pure)] to-transparent lg:block"
      />
    </section>
  );
}
