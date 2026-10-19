import Link from "next/link";
import {
  Bell,
  ChartNoAxesCombined,
  CircleDollarSign,
  Layers,
  Link2,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Counter } from "@/components/motion/Counter";
import { Marquee } from "@/components/motion/Marquee";
import { UrlForm } from "@/components/analyzer/UrlForm";

export function StoreMarquee() {
  const stores = ["Amazon India", "Flipkart", "Smartphones", "Laptops", "Audio", "Televisions", "Gaming", "Appliances", "Wearables", "Accessories"];
  return (
    <div className="relative border-y border-line py-5">
      <Marquee speed={38}>
        {stores.map((s) => (
          <span key={s} className="flex items-center gap-6 text-sm font-semibold uppercase tracking-wider text-ink-muted">
            {s} <span className="text-brand-400">✦</span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Paste any product link",
      body: "Amazon.in or Flipkart. Short links, app links and messy URLs all work.",
      icon: Link2,
    },
    {
      n: "02",
      title: "We read the real page",
      body: "Live price, MRP, seller, stock and ratings — extracted directly, never invented.",
      icon: Store,
    },
    {
      n: "03",
      title: "Get a plain verdict",
      body: "Buy, wait or avoid — with the real price history and true landed cost behind it.",
      icon: ChartNoAxesCombined,
    },
  ];
  return (
    <section id="how" className="relative py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400">How it works</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            A decision, not just a price
          </h2>
          <p className="mt-4 text-ink-soft">
            Most sites shout &ldquo;70% OFF&rdquo;. DealSense does the maths that actually matters.
          </p>
        </Reveal>

        <Stagger className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <StaggerItem key={s.n}>
              <div className="group relative h-full overflow-hidden rounded-3xl border border-line bg-surface p-7 backdrop-blur-xl transition-colors hover:border-brand-400/40">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500/12 text-brand-300">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="tabular text-4xl font-extrabold text-line-strong">{s.n}</span>
                </div>
                <h3 className="mt-6 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
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
    <section className="relative py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400">Built different</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            The honesty layer for Indian shopping
          </h2>
        </Reveal>

        <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <StaggerItem key={f.title} className={f.span}>
              <div className="group relative h-full overflow-hidden rounded-3xl border border-line bg-surface p-7 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40 hover:shadow-[0_24px_70px_-30px_rgba(16,185,129,0.6)]">
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/10 blur-2xl transition-opacity group-hover:opacity-100" />
                <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400/20 to-sky-500/20 text-brand-300">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="relative mt-5 text-lg font-bold">{f.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
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
    <section className="relative py-24">
      <Container>
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-surface p-8 backdrop-blur-xl sm:p-14">
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="relative grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-400">Our one rule</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                We will never show you a fake deal.
              </h2>
              <p className="mt-4 text-ink-soft">
                Competitors guess, fill gaps and invent charts. We would rather tell you
                &ldquo;not enough data&rdquo; than send you into a bad purchase.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  "If a price can't be verified, we say so — we never estimate.",
                  "If history is thin, we show you exactly how many real points we have.",
                  "If a discount is inflated, we call it out.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-ink-soft">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard value={<>Live</>} label="Prices read from the real page" />
              <StatCard value={<Counter to={100} suffix="%" />} label="Observations are real, never synthetic" />
              <StatCard value={<Counter to={2} />} label="Stores compared today — more coming" />
              <StatCard value={<Counter to={0} />} label="Fake deals shown. Ever." />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function StatCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface-raised/40 p-6">
      <div className="tabular text-3xl font-extrabold tracking-tight text-ink">{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-ink-muted">{label}</div>
    </div>
  );
}

export function Faq() {
  const items = [
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
      a: "From real observations we collect by reading merchant pages. We never fabricate charts or estimates. If we have too few data points, we tell you honestly.",
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
  return (
    <section id="faq" className="relative py-24">
      <Container size="narrow">
        <Reveal className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400">FAQ</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <div className="mt-12 space-y-3">
          {items.map((it) => (
            <details
              key={it.q}
              className="group rounded-2xl border border-line bg-surface px-6 py-5 backdrop-blur-xl transition-colors open:border-brand-400/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold">
                {it.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{it.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="relative py-24">
      <Container>
        <div className="relative overflow-hidden rounded-[32px] border border-brand-400/25 bg-gradient-to-br from-brand-500/15 via-surface to-sky-500/10 p-10 text-center backdrop-blur-xl sm:p-16">
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute -top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-500/30 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-2xl">
            <Sparkles className="mx-auto h-8 w-8 text-brand-300" />
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Stop guessing. Start checking.
            </h2>
            <p className="mt-4 text-ink-soft">
              Paste a link and get the truth in seconds. It&apos;s free, and it might save you thousands.
            </p>
            <div className="mx-auto mt-8 max-w-xl">
              <UrlForm size="md" />
            </div>
            <p className="mt-6 text-xs text-ink-muted">
              Prefer to browse? <Link href="/deals" className="text-brand-300 underline">See live deals</Link>.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
