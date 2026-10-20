import Link from "next/link";
import {
  Bell,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  Layers,
  Link2,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingDown,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Counter } from "@/components/motion/Counter";

const steps = [
  {
    title: "Paste the link",
    body: "Any Amazon or Flipkart product URL.",
    icon: Link2,
  },
  {
    title: "We read the real page",
    body: "Live price, stock, seller and rating.",
    icon: Store,
  },
  {
    title: "Get the verdict",
    body: "Buy, wait or avoid — with the history behind it.",
    icon: ChartNoAxesCombined,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-hairline py-14">
      <Container>
        <Stagger className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <StaggerItem key={s.title}>
              <div className="flex h-full items-start gap-4 rounded-2xl border border-hairline bg-card p-5 shadow-card">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-brand text-[#04140d]">
                  <s.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="tabular text-[11px] font-extrabold text-muted">0{i + 1}</span>
                    <h3 className="text-[15px] font-extrabold text-headline">{s.title}</h3>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-body">{s.body}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

export function Integrity() {
  return (
    <section className="border-t border-hairline py-14">
      <Container>
        <div className="grid items-center gap-8 rounded-3xl border border-hairline bg-card p-7 shadow-card sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
              <ShieldCheck className="h-3 w-3" /> Our one rule
            </span>
            <h2 className="mt-4 text-[26px] font-extrabold tracking-[-0.025em] text-headline sm:text-[32px]">
              We never show a fake deal.
            </h2>
            <ul className="mt-5 space-y-2.5">
              {[
                "No price we can't verify",
                "No invented history",
                "No inflated discounts",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[13.5px] font-semibold text-body">
                  <Check />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat value="Live" label="Prices read live" />
            <Stat value={<Counter to={100} suffix="%" />} label="Real observations" />
            <Stat value={<Counter to={2} />} label="Stores compared" />
            <Stat value={<Counter to={0} />} label="Fake deals, ever" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function Check() {
  return (
    <span className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[9px] font-black text-[var(--dw-green-mid)]">
      ✓
    </span>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-subtle p-4">
      <div className="tabular text-[24px] font-extrabold tracking-tight text-headline">{value}</div>
      <div className="mt-1 text-[11.5px] font-semibold leading-snug text-muted">{label}</div>
    </div>
  );
}

const faqs = [
  {
    q: "Is DealSense really free?",
    a: "Yes. Checking prices, seeing history and setting alerts is free. DealSense earns a small commission when you buy through our links — at no extra cost to you.",
  },
  {
    q: "How does DealSense make money?",
    a: "Affiliate commissions from Amazon, Flipkart and Myntra. Our verdict is never influenced by who pays more — if Flipkart is cheaper, we tell you.",
  },
  {
    q: "Where does the price history come from?",
    a: "Real observations we collect by reading merchant pages, plus market context computed across every product we have verified. We never fabricate charts. If we have too few data points, we say so honestly.",
  },
  {
    q: "What if a product has no history yet?",
    a: "You still get the live price, the true landed cost, the advertised discount, and the typical price range for that category. The chart fills in as we record real observations.",
  },
  {
    q: "Which stores are supported?",
    a: "Amazon India, Flipkart and Myntra today, with exact-variant cross-store matching. More Indian merchants are on the roadmap.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. DealSense is built mobile-first. Copy a product link from the store app and paste it here.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-hairline py-14">
      <Container size="narrow">
        <Reveal className="text-center">
          <h2 className="text-[26px] font-extrabold tracking-[-0.025em] text-headline sm:text-[32px]">
            Questions, answered
          </h2>
        </Reveal>
        <div className="mt-8 space-y-2">
          {faqs.map((it) => (
            <details
              key={it.q}
              className="group rounded-2xl border border-hairline bg-card px-5 py-3.5 transition-colors open:border-emerald-400/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-bold text-headline">
                {it.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline text-secondary transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2.5 text-[13px] leading-relaxed text-body">{it.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Community bar */
export function CommunityBar() {
  return (
    <div className="border-b border-hairline py-4">
      <Container>
        <div className="flex flex-wrap items-center justify-center gap-3 text-[12.5px] font-bold text-headline">
          <Bot className="h-4 w-4 text-emerald-500" />
          <span>Join our deal community:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1 text-[#128C7E] dark:text-[#4ade80]">
            WhatsApp
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-sky-600 dark:text-sky-300">
            Telegram
          </span>
        </div>
      </Container>
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="border-t border-hairline py-14">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-hairline bg-card p-10 text-center shadow-card sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-gradient-brand opacity-[0.07]" />
          <div className="relative mx-auto max-w-2xl">
            <Sparkles className="mx-auto h-7 w-7 text-emerald-500" />
            <h2 className="mt-4 text-[28px] font-extrabold tracking-[-0.025em] text-headline sm:text-[36px]">
              Stop guessing. Start checking.
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/analyze" variant="gradient" size="lg">
                <Zap className="h-4 w-4" /> Analyse a deal
              </ButtonLink>
              <ButtonLink href="/deals" variant="outline" size="lg">
                <TrendingDown className="h-4 w-4" /> Browse deals
              </ButtonLink>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] font-semibold text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Live prices
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-emerald-500" /> Real history
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-emerald-500" /> Free alerts
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
