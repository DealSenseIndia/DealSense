"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, ChevronRight, Link2, Search, ShieldCheck } from "lucide-react";
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

const POPULAR = [
  { label: "iPhone 15", q: "iPhone 15" },
  { label: "PS5", q: "PS5" },
  { label: "Smart TV", q: "Smart TV" },
  { label: "Laptops", q: "laptop" },
  { label: "Nike Shoes", q: "Nike shoes" },
  { label: "Watches", q: "smartwatch" },
];

const STORE_ICONS = ["amazon", "flipkart", "myntra"];

export function Hero({ featured }: { featured?: FeaturedDeal | null }) {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function go(value: string) {
    const v = value.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) router.push(`/analyze?url=${encodeURIComponent(v)}`);
    else router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <section className="relative overflow-hidden border-b border-hairline">
      {/* the DealSense 1.0 hero gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #F0FDF4 0%, #F7FEE7 40%, #FFFFFF 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "linear-gradient(180deg, rgba(6,78,59,0.16) 0%, rgba(11,16,29,0.95) 100%)",
        }}
      />

      <Container size="wide">
        <div className="relative grid items-center gap-9 py-9 lg:grid-cols-[54%_46%]">
          {/* ===================== LEFT ===================== */}
          <div className="flex min-w-0 flex-col gap-[18px]">
            {/* trust badge */}
            <span className="inline-flex w-fit items-center gap-[7px] rounded-full border border-[var(--dw-green-border)] bg-[rgba(16,185,129,0.08)] px-[14px] py-[5px] text-[11.5px] font-semibold text-[var(--dw-green-bot)] shadow-[0_0_16px_rgba(16,185,129,0.12)]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--dw-green-main)]" />
              India&apos;s Most Trusted Shopping Intelligence Platform
            </span>

            {/* headline */}
            <h1 className="text-[52px] font-black leading-[1.08] tracking-[-0.035em] text-headline max-lg:text-[40px] max-sm:text-[32px]">
              Shop <span className="text-[var(--dw-green-main)] [text-shadow:0_0_30px_rgba(16,185,129,0.3)]">smarter.</span>
              <br />
              Save <span className="text-[var(--dw-green-main)] [text-shadow:0_0_30px_rgba(16,185,129,0.3)]">bigger.</span>
            </h1>

            {/* sub */}
            <p className="max-w-[520px] text-[15.5px] leading-[1.6] text-body">
              Track price history, compare across stores, get price drop alerts and know the best
              time to buy.
            </p>

            {/* search */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go(url);
              }}
              className="flex w-full max-w-[680px] flex-col items-stretch gap-1 rounded-2xl border border-hairline bg-card p-[6px_8px] shadow-card transition-all focus-within:border-[var(--dw-green-mid)] focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.18)] sm:flex-row sm:items-center"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 pl-[10px] pr-1">
                <Link2 className="h-[18px] w-[18px] shrink-0 text-muted" />
                <span className="hidden items-center gap-[5px] rounded-full border border-hairline bg-subtle px-[7px] py-[3px] sm:flex">
                  {STORE_ICONS.map((s) => (
                    <span
                      key={s}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-hairline bg-card"
                    >
                      <StoreLogo merchant={s} size={14} rounded={false} />
                    </span>
                  ))}
                </span>
                <span className="ml-1 mr-0.5 hidden h-6 w-px shrink-0 bg-hairline sm:block" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste any product link (Amazon, Flipkart, etc.) or search"
                  className="h-[46px] w-full min-w-0 flex-1 bg-transparent px-3 text-[14px] text-headline placeholder:text-[13.5px] placeholder:text-muted focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
              </span>

              <button
                type="submit"
                className="inline-flex h-[42px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-[13.5px] font-bold text-white shadow-[0_8px_22px_-10px_rgba(5,150,105,0.95)] transition-all hover:-translate-y-0.5 hover:bg-emerald-700 sm:w-auto"
              >
                <Search className="h-4 w-4" />
                Analyze Deal
              </button>
            </form>

            {/* popular */}
            <div className="mt-[10px] flex flex-wrap items-center gap-2">
              <span className="mr-0.5 text-[13px] font-bold text-body">Popular:</span>
              {POPULAR.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => router.push(`/search?q=${encodeURIComponent(p.q)}`)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-hairline bg-card px-[13px] py-[5px] text-[12.5px] font-medium text-body transition-all hover:-translate-y-px hover:border-[var(--dw-green-mid)] hover:text-headline hover:shadow-card"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ===================== RIGHT — girl + floating cards ===================== */}
          <div className="relative mx-auto flex h-[420px] w-full max-w-[550px] items-end justify-center max-lg:h-[380px] max-lg:max-w-[440px] max-sm:flex max-sm:h-auto max-sm:max-w-none max-sm:flex-col max-sm:items-center max-sm:pt-3">
            {/* official artwork */}
            <Image
              src="/brand/hero-illustration.webp"
              alt="DealSense Shopping Intelligence"
              width={1024}
              height={576}
              priority
              className="relative z-[2] mx-auto block h-auto w-full max-w-[500px] shrink-0 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.15)] max-sm:max-w-[290px]"
            />

            {/* FLOAT 1 — Price History */}
            <div className="floating-overlay-card float-anim-a absolute left-[-20px] top-[75px] z-[3] w-[245px] rounded-[18px] border border-hairline bg-card p-[14px_16px_12px] shadow-card max-sm:hidden">
              <div className="mb-1.5 text-[13px] font-bold leading-tight text-headline">
                Price History
              </div>
              <div className="relative h-[56px] w-full">
                <Sparkline series={featured?.series ?? []} />
                {featured?.low ? (
                  <div className="absolute -top-2.5 right-1.5 z-[2] rounded-xl border border-[var(--dw-green-border)] bg-card px-2.5 py-[5px] text-left shadow-card">
                    <span className="block text-[9.5px] font-bold leading-tight text-[var(--dw-green-bot)]">
                      Lowest Price
                    </span>
                    <span className="tabular my-px block text-[14px] font-extrabold leading-tight text-headline">
                      {formatINR(featured.low.price)}
                    </span>
                    <span className="block text-[9px] font-medium leading-tight text-muted">
                      on {formatDate(featured.low.at)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* FLOAT 2 — Price Drop Alert */}
            <div className="floating-overlay-card float-anim-b absolute left-0 top-[205px] z-[3] flex w-[240px] items-center gap-3 rounded-[18px] border border-hairline bg-card px-4 py-3 shadow-card max-sm:hidden">
              <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] border border-[var(--dw-green-border)] bg-[rgba(16,185,129,0.08)]">
                <Bell className="h-5 w-5 text-[var(--dw-green-main)]" />
              </span>
              <div className="flex min-w-0 flex-col">
                <div className="text-[11.5px] font-bold leading-tight text-headline">
                  Price Drop Alert
                </div>
                <div className="my-px text-[10px] text-muted">Great news!</div>
                <div className="text-[11.5px] font-extrabold leading-tight text-[var(--dw-green-bot)]">
                  {featured?.lastDrop
                    ? `Price dropped by ${formatINR(featured.lastDrop.amount)}`
                    : "Watching this product closely"}
                </div>
              </div>
            </div>

            {/* FLOAT 3 — Featured product */}
            {featured ? (
              <Link
                href={featured.href}
                className="floating-overlay-card float-anim-c absolute right-[-5px] top-[15px] z-[3] flex w-[320px] items-start gap-[14px] rounded-[18px] border border-hairline bg-card p-[14px_16px] shadow-card transition-transform hover:-translate-y-1 max-sm:static max-sm:mt-3.5 max-sm:w-full max-sm:max-w-[340px]"
              >
                <div className="flex h-[92px] w-[76px] shrink-0 items-center justify-center">
                  {featured.imageUrl ? (
                    <Image
                      src={featured.imageUrl}
                      alt={featured.title}
                      width={76}
                      height={92}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.15)]"
                      unoptimized
                    />
                  ) : (
                    <StoreLogo merchant={featured.merchant} size={44} />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div>
                    <span className="inline-block rounded border border-[var(--dw-green-border)] bg-[rgba(16,185,129,0.08)] px-[7px] py-[2px] text-[9px] font-extrabold uppercase leading-[1.2] tracking-[0.5px] text-[var(--dw-green-bot)]">
                      {featured.lastDrop ? "Live Drop" : "Recently Viewed"}
                    </span>
                  </div>
                  <h4 className="mt-1 max-w-[195px] truncate text-[13.5px] font-extrabold leading-tight text-headline">
                    {featured.title}
                  </h4>
                  <div className="mt-0.5 mb-[3px] max-w-[195px] truncate text-[11px] font-medium text-muted">
                    {featured.points ? `${featured.points} price points tracked` : featured.merchant}
                  </div>
                  {featured.rating !== null ? (
                    <div className="mb-1.5 flex items-center gap-1 text-[11.5px]">
                      <span className="font-bold text-headline">{featured.rating}</span>
                      <span className="-tracking-[1px] text-amber-500">★★★★★</span>
                      {featured.reviewCount ? (
                        <span className="text-[11px] text-muted">
                          ({featured.reviewCount.toLocaleString("en-IN")})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mb-2 flex items-baseline gap-1.5">
                    <span className="tabular text-[16px] font-extrabold text-[var(--dw-green-mid)]">
                      {formatINR(featured.price)}
                    </span>
                    {featured.mrp ? (
                      <span className="tabular text-[11.5px] text-muted line-through">
                        {formatINR(featured.mrp)}
                      </span>
                    ) : null}
                    {featured.discount ? (
                      <span className="whitespace-nowrap rounded border border-red-500/30 bg-red-500/10 px-1.5 py-[2px] text-[10.5px] font-bold text-red-600">
                        {featured.discount}% OFF
                      </span>
                    ) : null}
                  </div>
                  <span className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-hairline bg-subtle text-[12.5px] font-semibold text-headline transition-all hover:-translate-y-px hover:border-[var(--dw-green-mid)] hover:text-[var(--dw-green-bot)]">
                    View Deal
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}

const SPARK_W = 215;
const SPARK_H = 58;

/** Real price sparkline — drawn from the recorded series, never a stock path. */
function Sparkline({ series }: { series: number[] }) {
  const pts = series.filter((p) => Number.isFinite(p) && p > 0);

  if (pts.length < 2) {
    return (
      <div className="flex h-[56px] items-center justify-center rounded-lg border border-dashed border-hairline text-[10.5px] font-semibold text-muted">
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

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="block h-full w-full"
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
