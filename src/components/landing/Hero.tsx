"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bell, Link2, Mic, Search, ShieldCheck, Sparkles, TrendingDown, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

const POPULAR = [
  { label: "iPhone 17", q: "iPhone 17", emoji: "📱" },
  { label: "PS5", q: "PS5", emoji: "🎮" },
  { label: "Smart TV", q: "Smart TV", emoji: "📺" },
  { label: "Laptops", q: "laptop", emoji: "💻" },
  { label: "Headphones", q: "headphones", emoji: "🎧" },
  { label: "Watches", q: "smartwatch", emoji: "⌚" },
];

const STORES = [
  { label: "Amazon", short: "a", bg: "#FF9900", fg: "#000" },
  { label: "Flipkart", short: "f", bg: "#2874F0", fg: "#fff" },
  { label: "Croma", short: "C", bg: "#00A0E9", fg: "#fff" },
  { label: "Myntra", short: "M", bg: "#FF3F6C", fg: "#fff" },
  { label: "AJIO", short: "A", bg: "#2C4152", fg: "#fff" },
];

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Hero({ trackedToday = 0 }: { trackedToday?: number }) {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function go(value: string) {
    const v = value.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v) || /amazon|flipkart/i.test(v)) {
      router.push(`/analyze?url=${encodeURIComponent(v)}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(v)}`);
    }
  }

  return (
    <section className="relative overflow-hidden pb-12 pt-10 sm:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-wash-strong" aria-hidden />

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
              <span className="h-2 w-2 animate-pulse-ring rounded-full bg-brand-500" />
              {trackedToday > 0
                ? `${trackedToday.toLocaleString("en-IN")} price points tracked`
                : "Live price tracking across India"}
            </motion.div>

            <motion.h1
              variants={rise}
              custom={1}
              initial="hidden"
              animate="show"
              className="mt-5 text-[38px] font-extrabold leading-[1.03] tracking-[-0.035em] text-headline sm:text-[54px] lg:text-[62px]"
            >
              DealSense:
              <br />
              <span className="text-gradient-brand">Never overpay</span>{" "}
              <span className="text-gradient-deep">online</span>
              <span className="inline-block h-[0.9em] w-[3px] translate-y-[0.05em] animate-blink bg-brand-500" />
            </motion.h1>

            <motion.p
              variants={rise}
              custom={2}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-[30rem] text-[15.5px] leading-relaxed text-body"
            >
              Paste any Amazon or Flipkart link. We read the real price history, compare every store
              and tell you plainly: <strong className="font-bold text-headline">buy, wait or avoid.</strong>
            </motion.p>

            {/* Big search bar */}
            <motion.form
              variants={rise}
              custom={3}
              initial="hidden"
              animate="show"
              onSubmit={(e) => {
                e.preventDefault();
                go(url);
              }}
              className="mt-7 flex max-w-[38rem] items-center gap-2 rounded-2xl border border-hairline bg-card p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] transition-shadow focus-within:shadow-[0_18px_50px_-20px_rgba(16,185,129,0.45)]"
            >
              <span className="pl-2.5 text-muted">
                <Link2 className="h-4.5 w-4.5" />
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Search for any product or paste a link…"
                className="h-11 min-w-0 flex-1 bg-transparent text-[14.5px] text-headline placeholder:text-muted focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="hidden h-5 w-px bg-hairline sm:block" />
              <button type="button" aria-label="Voice search" className="hidden text-muted hover:text-headline sm:block">
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-brand px-5 text-[13.5px] font-extrabold text-[#04140d] transition-transform hover:-translate-y-0.5 hover:brightness-105"
              >
                <Search className="h-4 w-4" />
                Find best deals
              </button>
            </motion.form>

            {/* Popular pills */}
            <motion.div
              variants={rise}
              custom={4}
              initial="hidden"
              animate="show"
              className="mt-5 flex flex-wrap items-center gap-2"
            >
              <span className="text-[12.5px] font-bold text-muted">Popular:</span>
              {POPULAR.map((p) => (
                <Link
                  key={p.label}
                  href={`/search?q=${encodeURIComponent(p.q)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-body transition-all hover:-translate-y-0.5 hover:border-brand-400/50 hover:text-headline"
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.label}
                </Link>
              ))}
            </motion.div>

            {/* Trust row */}
            <motion.div
              variants={rise}
              custom={5}
              initial="hidden"
              animate="show"
              className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-secondary"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-500" /> Live verified prices
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-brand-500" /> Real price history
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-brand-500" /> True landed cost
              </span>
            </motion.div>

            {/* Store logos */}
            <motion.div
              variants={rise}
              custom={6}
              initial="hidden"
              animate="show"
              className="mt-6 flex flex-wrap items-center gap-4"
            >
              <span className="text-[11.5px] font-bold text-muted">We compare</span>
              {STORES.map((s) => (
                <span
                  key={s.label}
                  title={s.label}
                  className="grid h-7 w-7 place-items-center rounded-lg text-[9.5px] font-black shadow-sm"
                  style={{ background: s.bg, color: s.fg }}
                >
                  {s.short}
                </span>
              ))}
              <span className="text-[11.5px] font-semibold text-muted">+ 2,000 more stores via Cuelinks</span>
            </motion.div>
          </div>

          {/* ---------------- Right: our girl + floating cards ---------------- */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-[560px]"
          >
            <div className="relative">
              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-0"
              >
                <Image
                  src="/brand/hero-illustration.webp"
                  alt="A shopper checking a price on her phone while tracking a price chart"
                  width={1024}
                  height={576}
                  priority
                  className="h-auto w-full drop-shadow-[0_24px_48px_rgba(15,23,42,0.14)]"
                />
              </motion.div>

              {/* Floating widget cards */}
              <div className="pointer-events-none absolute inset-0 z-10">
                <FloatCard className="left-0 top-0 w-[212px] animate-float sm:-left-3" delay="0s">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-extrabold text-headline">Price History</span>
                    <span className="rounded-lg border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-0.5 text-[9.5px] font-extrabold text-[var(--dw-green-mid)]">
                      Lowest ₹37,499
                    </span>
                  </div>
                  <svg viewBox="0 0 200 56" className="mt-2.5 h-12 w-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="hf2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 34 C 20 28, 36 44, 56 36 C 76 28, 94 46, 116 38 C 138 30, 160 44, 200 16 L200 56 L0 56 Z"
                      fill="url(#hf2)"
                    />
                    <path
                      d="M0 34 C 20 28, 36 44, 56 36 C 76 28, 94 46, 116 38 C 138 30, 160 44, 200 16"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="mt-1 text-[10px] font-semibold text-muted">on 12 Sep 2026</div>
                </FloatCard>

                <FloatCard className="left-0 top-[40%] w-[196px] animate-float sm:left-1" delay="-3s">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
                      <Bell className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="text-[11.5px] font-extrabold text-headline">Price Drop Alert</div>
                      <div className="text-[9.5px] font-semibold text-muted">Great news!</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10.5px] font-semibold text-secondary">Price dropped by</div>
                  <div className="tabular text-[17px] font-extrabold text-[var(--dw-green-mid)]">₹2,500</div>
                </FloatCard>

                <FloatCard className="right-0 top-0 w-[192px] animate-float sm:-right-2" delay="-1.6s">
                  <span className="rounded-md border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
                    Recently viewed
                  </span>
                  <div className="mt-2 text-[12px] font-extrabold leading-snug text-headline">
                    Sony WH-1000XM5
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10.5px]">
                    <span className="grid h-3.5 w-3.5 place-items-center rounded bg-[#FF9900] text-[6.5px] font-black text-black">
                      a
                    </span>
                    <span className="font-bold text-body">Amazon India</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-secondary">
                    <span className="text-amber-500">★</span> 4.6
                    <span className="text-muted">(12,540)</span>
                  </div>
                  <div className="tabular mt-1.5 text-[18px] font-extrabold text-headline">₹24,999</div>
                  <div className="mt-2 flex h-8 items-center justify-center rounded-lg bg-gradient-brand text-[11.5px] font-extrabold text-[#04140d]">
                    Check Deal →
                  </div>
                </FloatCard>

                <FloatCard className="bottom-0 right-[2%] w-[198px] animate-float" delay="-5s">
                  <div className="flex items-center gap-2.5">
                    <div className="relative grid h-10 w-10 shrink-0 place-items-center">
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
                      <span className="tabular absolute text-[11px] font-extrabold text-headline">92</span>
                    </div>
                    <div>
                      <div className="text-[12px] font-extrabold text-[var(--dw-green-mid)]">Buy Now</div>
                      <div className="text-[9.5px] font-semibold leading-snug text-secondary">
                        12% below the usual price
                      </div>
                    </div>
                  </div>
                </FloatCard>
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
      transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "absolute rounded-2xl border border-hairline bg-card/95 p-4 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] backdrop-blur-md",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      {children}
    </motion.div>
  );
}
