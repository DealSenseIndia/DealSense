"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bell,
  ChevronRight,
  Link2,
  Search,
  ShieldCheck,
  TrendingDown,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { cn, formatINR } from "@/lib/utils";

export interface FeaturedDeal {
  title: string;
  imageUrl: string | null;
  price: number | null;
  mrp: number | null;
  discount: number | null;
  rating: number | null;
  reviewCount: number | null;
  merchant: string;
  href: string;
  /** Recorded price series, oldest -> newest. */
  series?: number[];
  /** All-time low with the date it was observed. */
  low?: { price: number; at: number } | null;
  /** Most recent genuine price drop. */
  lastDrop?: { amount: number; at: number } | null;
  /** Number of recorded price points. */
  points?: number;
}

const STORE_ICONS = ["amazon", "flipkart", "myntra"];

export function Hero({
  productsTracked = 0,
  storesCompared = 0,
  featured,
}: {
  productsTracked?: number;
  storesCompared?: number;
  featured?: FeaturedDeal | null;
}) {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function go(value: string) {
    const v = value.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) router.push(`/analyze?url=${encodeURIComponent(v)}`);
    else router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <section className="relative overflow-hidden pb-10 pt-10 sm:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-wash" aria-hidden />

      <Container>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.02fr]">
          {/* ================= LEFT ================= */}
          <div>
            {/* trust badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3.5 py-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              India&apos;s Most Trusted Shopping Intelligence Platform
            </motion.div>

            {/* headline */}
            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 text-[42px] font-extrabold leading-[1.03] tracking-[-0.035em] text-headline sm:text-[58px] lg:text-[66px]"
            >
              Shop <span className="text-emerald-600">smarter.</span>
              <br />
              Save <span className="text-emerald-600">bigger.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 max-w-[32rem] text-[15.5px] leading-relaxed text-body"
            >
              Track price history, compare across stores, get price drop alerts and know the best
              time to buy.
            </motion.p>

            {/* search */}
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={(e) => {
                e.preventDefault();
                go(url);
              }}
              className="mt-7 flex max-w-[40rem] flex-col gap-2 rounded-2xl border border-hairline bg-card p-2 shadow-card focus-within:border-emerald-500/50 focus-within:shadow-[0_18px_46px_-22px_rgba(16,185,129,0.6)] sm:flex-row sm:items-center"
            >
              <div className="flex w-full min-w-0 items-center gap-2 pl-2.5 sm:flex-1">
                <Link2 className="h-4.5 w-4.5 shrink-0 text-muted" />
                <span className="hidden items-center gap-1.5 sm:flex">
                  {STORE_ICONS.map((s) => (
                    <StoreLogo key={s} merchant={s} size={20} />
                  ))}
                </span>
                <span className="hidden h-5 w-px bg-hairline sm:block" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste any product link or search here…"
                  className="h-11 w-full min-w-0 flex-1 bg-transparent text-[14.5px] text-headline placeholder:text-muted focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-[13.5px] font-extrabold text-white shadow-[0_10px_26px_-12px_rgba(5,150,105,0.95)] transition-all hover:-translate-y-0.5 hover:bg-emerald-700 sm:w-auto"
              >
                <Search className="h-4 w-4" />
                Analyze Deal
              </button>
            </motion.form>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 flex flex-wrap gap-3"
            >
              <Link
                href="/analyze"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-[13.5px] font-extrabold text-white shadow-[0_10px_26px_-12px_rgba(5,150,105,0.95)] transition-all hover:-translate-y-0.5 hover:bg-emerald-700"
              >
                <Zap className="h-4 w-4" />
                Analyze a Deal
              </Link>
              <Link
                href="/deals"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-600/40 bg-[var(--dw-green-surface)] px-6 text-[13.5px] font-extrabold text-[var(--dw-green-mid)] transition-all hover:-translate-y-0.5 hover:bg-emerald-600 hover:text-white"
              >
                <TrendingDown className="h-4 w-4" />
                Browse live deals
              </Link>
            </motion.div>
          </div>

          {/* ================= RIGHT — girl + old floating cards ================= */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-[640px]"
          >
            <div className="relative min-h-[400px] sm:min-h-[430px]">
              {/* the girl */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-[1] mx-auto w-full max-w-[500px]"
              >
                <Image
                  src="/brand/hero-illustration.webp"
                  alt="A shopper checking a price on her phone while tracking a price chart"
                  width={1024}
                  height={576}
                  priority
                  className="h-auto w-full drop-shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
                />
              </motion.div>

              {/* FLOAT 1 — Price History (top-left) — real recorded series */}
              <FloatCard
                className="hidden left-0 top-[44px] w-[224px] sm:-left-6 sm:block"
                delay="0s"
              >
                <HistoryCardContent featured={featured} />
              </FloatCard>

              {/* FLOAT 2 — Price Drop Alert (foreground left) — real recorded drop */}
              <FloatCard
                className="hidden left-0 top-[222px] w-[224px] sm:left-2 sm:block"
                delay="-3s"
              >
                <AlertCardContent featured={featured} />
              </FloatCard>

              {/* FLOAT 3 — Featured / recently viewed (top-right, in front) */}
              {featured && (
                <Link
                  href={featured.href}
                  className="absolute right-0 top-[8px] z-[4] hidden w-[238px] rounded-2xl border border-hairline bg-card p-3.5 shadow-pop transition-transform hover:-translate-y-1 sm:-right-6 sm:block"
                >
                  <ProductCardContent featured={featured} />
                </Link>
              )}

              {/* ---------- mobile: the same cards, stacked ---------- */}
              <div className="mt-4 space-y-3 sm:hidden">
                <div className="rounded-2xl border border-hairline bg-card p-3.5 shadow-pop">
                  <HistoryCardContent featured={featured} />
                </div>
                <div className="rounded-2xl border border-hairline bg-card p-3.5 shadow-pop">
                  <AlertCardContent featured={featured} />
                </div>
                {featured && (
                  <Link
                    href={featured.href}
                    className="block rounded-2xl border border-hairline bg-card p-3.5 shadow-pop"
                  >
                    <ProductCardContent featured={featured} />
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

function FloatCard({
  children,
  className,
  delay = "0s",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.4, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "absolute z-[3] rounded-2xl border border-hairline bg-card p-3.5 shadow-pop",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      {children}
    </motion.div>
  );
}

/** Price History card — the real recorded series, low and date. */
function HistoryCardContent({ featured }: { featured: FeaturedDeal | null | undefined }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12.5px] font-extrabold text-headline">Price History</div>
        {featured?.points ? (
          <div className="text-[9.5px] font-bold text-muted">{featured.points} pts</div>
        ) : null}
      </div>
      <div className="mt-1.5">
        <Sparkline series={featured?.series ?? []} />
        {featured?.low ? (
          <div className="mt-1 rounded-lg border border-hairline bg-subtle px-2.5 py-1.5">
            <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-muted">
              Lowest Price
            </div>
            <div className="tabular text-[13px] font-extrabold text-[var(--dw-green-mid)]">
              {formatINR(featured.low.price)}
            </div>
            <div className="text-[9.5px] font-semibold text-muted">
              on {formatDate(featured.low.at)}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Price Drop Alert card — the real most recent drop. */
function AlertCardContent({ featured }: { featured: FeaturedDeal | null | undefined }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
        <Bell className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-extrabold text-headline">Price Drop Alert</div>
        <div className="text-[10.5px] font-semibold text-muted">Great news!</div>
        {featured?.lastDrop ? (
          <>
            <div className="tabular mt-0.5 text-[12px] font-extrabold leading-tight text-[var(--dw-green-mid)]">
              Price dropped by {formatINR(featured.lastDrop.amount)}
            </div>
            <div className="text-[9.5px] font-semibold text-muted">
              on {formatDate(featured.lastDrop.at)}
            </div>
          </>
        ) : (
          <div className="mt-0.5 text-[11.5px] font-bold text-muted">
            Watching this product closely
          </div>
        )}
      </div>
    </div>
  );
}

/** The live product card. */
function ProductCardContent({ featured }: { featured: FeaturedDeal }) {
  return (
    <>
      <div className="flex gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-subtle">
          {featured.imageUrl && (
            <Image
              src={featured.imageUrl}
              alt={featured.title}
              fill
              sizes="64px"
              className="object-contain p-1"
              unoptimized
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-md border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
            {featured.lastDrop ? "Live drop" : "Recently viewed"}
          </span>
          <div className="mt-1 line-clamp-1 text-[12px] font-extrabold text-headline">
            {featured.title}
          </div>
          {featured.rating !== null && (
            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-secondary">
              <span className="text-amber-500">★</span> {featured.rating}
              {featured.reviewCount ? (
                <span className="text-muted">({featured.reviewCount.toLocaleString("en-IN")})</span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
        <span className="tabular text-[17px] font-extrabold text-headline">
          {formatINR(featured.price)}
        </span>
        {featured.mrp && (
          <span className="tabular text-[11px] text-muted line-through">
            {formatINR(featured.mrp)}
          </span>
        )}
        {featured.discount !== null && (
          <span className="rounded-md bg-[var(--dw-green-surface)] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[var(--dw-green-mid)]">
            {featured.discount}% OFF
          </span>
        )}
      </div>

      <div className="mt-2.5 flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-[11.5px] font-extrabold text-white">
        View Deal <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </>
  );
}

const SPARK_W = 215;
const SPARK_H = 58;

/** Real price sparkline — drawn from the recorded series, never a stock path. */
function Sparkline({ series }: { series: number[] }) {
  const pts = series.filter((p) => Number.isFinite(p) && p > 0);

  if (pts.length < 2) {
    return (
      <div className="flex h-[52px] items-center justify-center rounded-lg border border-dashed border-hairline text-[10.5px] font-semibold text-muted">
        Collecting price points…
      </div>
    );
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const padX = 5;
  const padRight = 9;
  const padTop = 6;
  const padBottom = 5;
  const innerH = SPARK_H - padTop - padBottom;

  const xy = pts.map((p, i) => {
    const x = padX + (i / (pts.length - 1)) * (SPARK_W - padX - padRight);
    const y = padTop + innerH - ((p - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${xy[xy.length - 1][0].toFixed(1)},${SPARK_H} L ${xy[0][0].toFixed(1)},${SPARK_H} Z`;
  const last = xy[xy.length - 1];

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="h-[52px] w-full"
      fill="none"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Recorded price trend, ${pts.length} points`}
    >
      <defs>
        <linearGradient id="histGreenGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.32" />
          <stop offset="70%" stopColor="#22C55E" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="4" y1="6" x2="4" y2="56" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" />
      <path d={area} fill="url(#histGreenGrad)" />
      <path d={line} stroke="#22C55E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="#22C55E" />
    </svg>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
