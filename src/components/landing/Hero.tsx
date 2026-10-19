"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bell, Link2, Search, ShieldCheck, Sparkles, TrendingDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

const POPULAR = [
  { label: "iPhone 15", q: "iPhone 15" },
  { label: "PS5", q: "PS5" },
  { label: "Smart TV", q: "Smart TV" },
  { label: "Laptops", q: "laptop" },
  { label: "Nike Shoes", q: "Nike shoes" },
  { label: "Watches", q: "smartwatch" },
];

const rise = {
  hidden: { opacity: 0, y: 22 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Hero() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function analyze(value: string) {
    const v = value.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v) || /amazon|flipkart/i.test(v)) {
      router.push(`/analyze?url=${encodeURIComponent(v)}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(v)}`);
    }
  }

  return (
    <section className="relative overflow-hidden pb-10 pt-10 sm:pt-14">
      {/* soft ambient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full opacity-[0.55] blur-[110px]"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.28), transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-[-14%] h-[420px] w-[420px] rounded-full opacity-40 blur-[110px]"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.22), transparent 65%)" }}
      />

      <Container size="wide" className="relative">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
          {/* ---------------- Left ---------------- */}
          <div>
            <motion.div
              variants={rise}
              custom={0}
              initial="hidden"
              animate="show"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3.5 py-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              India&apos;s Most Trusted Shopping Intelligence Platform
            </motion.div>

            <motion.h1
              variants={rise}
              custom={1}
              initial="hidden"
              animate="show"
              className="mt-5 text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] text-headline sm:text-[56px] lg:text-[64px]"
            >
              Shop smarter.
              <br />
              Save <span className="text-emerald-accent">bigger.</span>
            </motion.h1>

            <motion.p
              variants={rise}
              custom={2}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-[30rem] text-[15.5px] leading-relaxed text-body"
            >
              Track price history, compare across stores, get price drop alerts and know the best
              time to buy. Real verified data — never a fake discount.
            </motion.p>

            {/* Search bar */}
            <motion.form
              variants={rise}
              custom={3}
              initial="hidden"
              animate="show"
              onSubmit={(e) => {
                e.preventDefault();
                analyze(url);
              }}
              className="mt-7 flex max-w-[40rem] flex-col gap-2.5 rounded-2xl border border-hairline bg-card p-2 shadow-card sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted" />
                <span className="flex shrink-0 items-center gap-1">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#FF9900] text-[8.5px] font-black text-black">
                    a
                  </span>
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#2874F0] text-[8.5px] font-black text-white">
                    f
                  </span>
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste any product link (Amazon, Flipkart, etc.) or search"
                  className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-headline placeholder:text-muted focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-accent px-6 text-[13.5px] font-extrabold text-white shadow-[0_8px_22px_-10px_rgba(16,185,129,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[var(--dw-green-mid)]"
              >
                <Search className="h-4 w-4" />
                Analyze Deal
              </button>
            </motion.form>

            <motion.div
              variants={rise}
              custom={4}
              initial="hidden"
              animate="show"
              className="mt-4 flex flex-wrap items-center gap-2"
            >
              <span className="text-[12.5px] font-bold text-secondary">Popular:</span>
              {POPULAR.map((p) => (
                <Link
                  key={p.label}
                  href={`/search?q=${encodeURIComponent(p.q)}`}
                  className="rounded-full border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-body transition-all hover:-translate-y-0.5 hover:border-emerald-accent/50 hover:text-headline"
                >
                  {p.label}
                </Link>
              ))}
            </motion.div>

            <motion.div
              variants={rise}
              custom={5}
              initial="hidden"
              animate="show"
              className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-secondary"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-accent" /> Live verified prices
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-emerald-accent" /> Real price history
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-accent" /> True landed cost
              </span>
            </motion.div>
          </div>

          {/* ---------------- Right: floating widget cards ---------------- */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-[520px]"
          >
            <div className="relative h-[420px] sm:h-[440px]">
              {/* Price history card */}
              <FloatCard className="left-0 top-0 w-[268px] animate-float" delay="0s">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-extrabold text-headline">Price History</span>
                  <span className="rounded-lg border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-1 text-[10px] font-extrabold text-[var(--dw-green-mid)]">
                    Lowest ₹37,499
                  </span>
                </div>
                <svg viewBox="0 0 220 64" className="mt-3 h-14 w-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="hf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 40 C 22 34, 40 50, 62 42 C 84 34, 104 54, 128 46 C 152 38, 176 52, 220 20 L220 64 L0 64 Z"
                    fill="url(#hf)"
                  />
                  <path
                    d="M0 40 C 22 34, 40 50, 62 42 C 84 34, 104 54, 128 46 C 152 38, 176 52, 220 20"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="mt-1 text-[10.5px] font-semibold text-muted">on 12 Sep 2026</div>
              </FloatCard>

              {/* Price drop alert card */}
              <FloatCard className="bottom-6 left-2 w-[236px] animate-float sm:left-4" delay="-3s">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-extrabold text-headline">Price Drop Alert</div>
                    <div className="text-[10.5px] font-semibold text-muted">Great news!</div>
                  </div>
                </div>
                <div className="mt-2.5 text-[11.5px] font-semibold text-secondary">Price dropped by</div>
                <div className="tabular text-[19px] font-extrabold text-[var(--dw-green-mid)]">₹2,500</div>
              </FloatCard>

              {/* Recently viewed card */}
              <FloatCard className="right-0 top-[86px] w-[228px] animate-float" delay="-1.6s">
                <div className="flex items-center justify-between">
                  <span className="rounded-md border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
                    Recently viewed
                  </span>
                </div>
                <div className="mt-2.5 text-[13px] font-extrabold text-headline">Sony WH-1000XM5</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                  <span className="grid h-4 w-4 place-items-center rounded bg-[#FF9900] text-[7px] font-black text-black">
                    a
                  </span>
                  <span className="font-bold text-body">Amazon India</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-secondary">
                  <span className="text-amber-500">★</span> 4.6
                  <span className="text-muted">(12,540)</span>
                </div>
                <div className="tabular mt-2 text-[20px] font-extrabold text-headline">₹24,999</div>
                <div className="mt-2.5 flex h-9 items-center justify-center rounded-lg bg-emerald-accent text-[12px] font-extrabold text-white">
                  Check Deal →
                </div>
              </FloatCard>

              {/* Verdict card */}
              <FloatCard className="bottom-0 right-2 w-[250px] animate-float sm:right-6" delay="-5s">
                <div className="flex items-center gap-3">
                  <div className="relative grid h-12 w-12 shrink-0 place-items-center">
                    <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
                      <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border-card)" strokeWidth="4" />
                      <motion.circle
                        cx="24"
                        cy="24"
                        r="20"
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 20}
                        initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - 0.92) }}
                        transition={{ delay: 0.7, duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </svg>
                    <span className="tabular absolute text-[12px] font-extrabold text-headline">92</span>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-extrabold text-[var(--dw-green-mid)]">Buy Now</div>
                    <div className="text-[10.5px] font-semibold leading-snug text-secondary">
                      12% below the price this usually costs
                    </div>
                  </div>
                </div>
              </FloatCard>
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
      transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "absolute rounded-2xl border border-hairline bg-card p-4 shadow-pop",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      {children}
    </motion.div>
  );
}
