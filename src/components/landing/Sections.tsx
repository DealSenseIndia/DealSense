import Link from "next/link";
import {
  Bell,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  Layers,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Counter } from "@/components/motion/Counter";

const steps = [
  {
    n: "01",
    title: "Paste any product link",
    body: "Amazon.in or Flipkart. Short links, app links and messy URLs all work.",
  },
  {
    n: "02",
    title: "We read the real page",
    body: "Live price, MRP, seller, stock and ratings — extracted directly, never invented.",
  },
  {
    n: "03",
    title: "Get a plain verdict",
    body: "Buy, wait or avoid — with the real price history and true landed cost behind it.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative border-t border-hairline py-16">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-extrabold uppercase tracking-widest text-[var(--dw-green-mid)]">
            How it works
          </p>
          <h2 className="mt-3 text-[30px] font-extrabold tracking-[-0.025em] text-headline sm:text-[38px]">
            A decision, not just a price
          </h2>
          <p className="mt-3 text-[15px] text-body">
            Most sites shout &ldquo;70% OFF&rdquo;. DealSense does the maths that actually matters.
          </p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <StaggerItem key={s.n}>
              <div className="group h-full rounded-card border border-hairline bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:border-brand-400/40 hover:shadow-[0_20px_50px_-24px_rgba(16,185,129,0.5)]">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-brand text-[15px] font-extrabold text-[#04140d]">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-5 text-[16px] font-extrabold text-headline">{s.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body">{s.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

export function Features() {
  const features = [
    {
      title: "Real price history",
      body: "Every price point is a genuine, timestamped observation. We never draw a made-up chart.",
      icon: ChartNoAxesCombined,
      span: "md:col-span-2",
    },
    {
      title: "True landed price",
      body: "Base + delivery − coupon − card offer = what you actually pay.",
      icon: CircleDollarSign,
    },
    {
      title: "Cross-store comparison",
      body: "Amazon vs Flipkart, matched to the exact same variant. No 128GB-vs-256GB nonsense.",
      icon: Layers,
    },
    {
      title: "Fake-discount detection",
      body: "We catch inflated MRPs and say so, instead of celebrating a fake deal.",
      icon: ShieldCheck,
    },
    {
      title: "Price drop alerts",
      body: "Set a target, a % drop or a deal score. Get pinged on Telegram or email the moment it hits.",
      icon: Bell,
    },
  ];

  return (
    <section className="relative py-16">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-extrabold uppercase tracking-widest text-[var(--dw-green-mid)]">
            Built different
          </p>
          <h2 className="mt-3 text-[30px] font-extrabold tracking-[-0.025em] text-headline sm:text-[38px]">
            The honesty layer for Indian shopping
          </h2>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <StaggerItem key={f.title} className={f.span}>
              <div className="group relative h-full overflow-hidden rounded-card border border-hairline bg-card p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40 hover:shadow-[0_24px_60px_-28px_rgba(16,185,129,0.55)]">
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/10 blur-2xl" />
                <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-brand text-[#04140d]">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="relative mt-5 text-[17px] font-extrabold text-headline">{f.title}</h3>
                <p className="relative mt-2 text-[13.5px] leading-relaxed text-body">{f.body}</p>
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
    <section className="relative border-t border-hairline py-16">
      <Container>
        <div className="grid items-center gap-10 rounded-[28px] border border-hairline bg-card p-8 shadow-card sm:p-12 lg:grid-cols-2">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-widest text-[var(--dw-green-mid)]">
              Our one rule
            </p>
            <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.025em] text-headline sm:text-[36px]">
              We will never show you a fake deal.
            </h2>
            <p className="mt-3 text-[15px] text-body">
              Competitors guess, fill gaps and invent charts. We would rather tell you &ldquo;not enough
              data&rdquo; than send you into a bad purchase.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "If a price can't be verified, we say so — we never estimate.",
                "If history is thin, we show exactly how many real points we have.",
                "If a discount is inflated, we call it out.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[13.5px] text-body">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat value="Live" label="Prices read from the real page" />
            <Stat value={<Counter to={100} suffix="%" />} label="Observations are real, never synthetic" />
            <Stat value={<Counter to={2} />} label="Stores compared today — more coming" />
            <Stat value={<Counter to={0} />} label="Fake deals shown. Ever." />
          </div>
        </div>
      </Container>
    </section>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-subtle p-5">
      <div className="tabular text-[28px] font-extrabold tracking-tight text-headline">{value}</div>
      <div className="mt-1.5 text-[12px] leading-relaxed text-secondary">{label}</div>
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
    a: "Affiliate commissions from Amazon and Flipkart. Our verdict is never influenced by who pays more — if Flipkart is cheaper, we tell you.",
  },
  {
    q: "Where does the price history come from?",
    a: "From real observations we collect by reading merchant pages, plus market context computed across every product we have verified. We never fabricate charts. If we have too few data points, we say so honestly.",
  },
  {
    q: "What if a product has no history yet?",
    a: "You still get the live price, the true landed cost, the advertised discount, and the typical price range for that category. The chart fills in as DealSense records real observations.",
  },
  {
    q: "Which stores are supported?",
    a: "Amazon India and Flipkart today, with exact-variant cross-store matching. More Indian merchants are on the roadmap.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. DealSense is built mobile-first. Copy a product link from the Amazon or Flipkart app and paste it here.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative border-t border-hairline py-16">
      <Container size="narrow">
        <Reveal className="text-center">
          <p className="text-[12px] font-extrabold uppercase tracking-widest text-[var(--dw-green-mid)]">FAQ</p>
          <h2 className="mt-3 text-[30px] font-extrabold tracking-[-0.025em] text-headline sm:text-[38px]">
            Questions, answered
          </h2>
        </Reveal>
        <div className="mt-10 space-y-2.5">
          {faqs.map((it) => (
            <details
              key={it.q}
              className="group rounded-2xl border border-hairline bg-card px-5 py-4 transition-colors open:border-brand-400/40 open:bg-subtle"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-bold text-headline">
                {it.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline text-secondary transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-body">{it.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Buyhatke-style community bar + CTA */
export function CommunityBar() {
  return (
    <div className="border-y border-hairline bg-card/70 py-5 backdrop-blur">
      <Container>
        <div className="flex flex-wrap items-center justify-center gap-3 text-[13.5px] font-bold text-headline">
          <span className="inline-flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand-500" />
            Join our deal community on:
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-3.5 py-1.5 text-[#128C7E] dark:text-[#4ade80]">
            WhatsApp
          </span>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-3.5 py-1.5 text-sky-600 dark:text-sky-300">
            Telegram
          </span>
        </div>
      </Container>
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="relative py-16">
      <div className="pointer-events-none absolute inset-0 bg-wash" aria-hidden />
      <Container className="relative">
        <div className="relative overflow-hidden rounded-[28px] border border-hairline bg-card p-10 text-center shadow-card sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-gradient-brand opacity-[0.07]" />
          <div className="relative mx-auto max-w-2xl">
            <Sparkles className="mx-auto h-7 w-7 text-brand-500" />
            <h2 className="mt-5 text-[30px] font-extrabold tracking-[-0.025em] text-headline sm:text-[40px]">
              Stop guessing. Start checking.
            </h2>
            <p className="mt-3 text-[15px] text-body">
              Paste a link and get the truth in seconds. It&apos;s free, and it might save you thousands.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/analyze" variant="gradient" size="lg">
                Analyze a deal
              </ButtonLink>
              <ButtonLink href="/search?q=laptop" variant="outline" size="lg">
                Browse products
              </ButtonLink>
            </div>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] font-semibold text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-brand-500" /> Instant verdict
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-brand-500" /> Real price history
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-brand-500" /> Free drop alerts
              </span>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
