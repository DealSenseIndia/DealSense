"use client";

import { motion, type Variants } from "framer-motion";
import { ArrowDownRight, ShieldCheck, Sparkles, TrendingDown, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { UrlForm } from "@/components/analyzer/UrlForm";
import { Aurora, GridBackdrop } from "@/components/motion/Aurora";
import { Magnetic } from "@/components/motion/Interactive";
import { ButtonLink } from "@/components/ui/Button";

const float: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.12, duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-16 sm:pt-24">
      <Aurora intensity={1.1} />
      <GridBackdrop />
      <Container size="wide" className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left */}
          <div>
            <motion.div
              variants={float}
              custom={0}
              initial="hidden"
              animate="show"
              className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold text-brand-200"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Real prices. Zero guesswork.
            </motion.div>

            <motion.h1
              variants={float}
              custom={1}
              initial="hidden"
              animate="show"
              className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Know if it&apos;s <span className="gradient-text">actually</span> a good deal
              <span className="text-ink-muted"> — before you buy.</span>
            </motion.h1>

            <motion.p
              variants={float}
              custom={2}
              initial="hidden"
              animate="show"
              className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft"
            >
              Paste any Amazon or Flipkart link. DealSense verifies the live price, reads the real
              price history, compares stores and tells you plainly: <strong className="text-ink">buy,
              wait or avoid.</strong>
            </motion.p>

            <motion.div variants={float} custom={3} initial="hidden" animate="show" className="mt-8 max-w-xl">
              <UrlForm />
            </motion.div>

            <motion.div
              variants={float}
              custom={4}
              initial="hidden"
              animate="show"
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-muted"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-400" /> Live verified prices
              </span>
              <span className="inline-flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-brand-400" /> Real price history
              </span>
              <span className="inline-flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-400" /> True landed cost
              </span>
            </motion.div>

            <motion.div variants={float} custom={5} initial="hidden" animate="show" className="mt-8">
              <Magnetic>
                <ButtonLink href="/deals" variant="outline" size="md">
                  Browse live deals
                </ButtonLink>
              </Magnetic>
            </motion.div>
          </div>

          {/* Right — floating verdict card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="animate-float">
              <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface p-6 backdrop-blur-2xl shadow-[0_40px_120px_-40px_rgba(16,185,129,0.5)]">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#FF9900] px-3 py-1 text-xs font-bold text-black">
                    Amazon
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-emerald-400" /> Live
                  </span>
                </div>

                <div className="mt-5 h-28">
                  <svg viewBox="0 0 320 112" className="h-full w-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 30 C 40 24, 70 70, 110 58 C 150 46, 180 86, 220 74 C 260 62, 290 96, 320 90 L320 112 L0 112 Z"
                      fill="url(#heroArea)"
                    />
                    <path
                      d="M0 30 C 40 24, 70 70, 110 58 C 150 46, 180 86, 220 74 C 260 62, 290 96, 320 90"
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-xs text-ink-muted">Current price</div>
                    <div className="tabular text-3xl font-extrabold tracking-tight">₹42,999</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink-muted">Typical</div>
                    <div className="tabular text-lg text-ink-soft line-through">₹48,999</div>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500 text-lg">
                    🔥
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-emerald-200">Buy now — 91/100</div>
                    <div className="flex items-center gap-1 text-xs text-emerald-300/80">
                      <ArrowDownRight className="h-3 w-3" /> 12% below the typical price
                    </div>
                  </div>
                </div>
              </div>

              {/* floating chips */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="absolute -right-4 top-16 hidden rounded-2xl border border-line bg-surface-solid/95 px-4 py-3 shadow-xl backdrop-blur sm:block"
              >
                <div className="text-[11px] text-ink-muted">Cheaper on</div>
                <div className="text-sm font-bold text-[#2874F0]">Flipkart ₹700</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 }}
                className="absolute -left-5 bottom-10 hidden rounded-2xl border border-line bg-surface-solid/95 px-4 py-3 shadow-xl backdrop-blur sm:block"
              >
                <div className="text-[11px] text-ink-muted">Landed price</div>
                <div className="tabular text-sm font-bold text-emerald-300">₹39,499</div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
