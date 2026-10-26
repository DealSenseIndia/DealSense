import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Layers, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { GeminiIcon } from "@/components/ui/GeminiIcon";

const ROOMS = [
  {
    key: "bedroom",
    title: "Bedroom",
    from: "₹20k",
    image: "/images/setups/bedroom.webp",
    alt: "Warm bedroom with a sheesham wood bed, plants and soft daylight",
  },
  {
    key: "wfh_desk",
    title: "Work desk",
    from: "₹10k",
    image: "/images/setups/wfh.webp",
    alt: "Home office with an ergonomic chair, wooden desk and monitor",
  },
  {
    key: "living_room",
    title: "Living room",
    from: "₹15k",
    image: "/images/setups/living.webp",
    alt: "Living room with a warm sofa, coffee table and indoor plants",
  },
  {
    key: "baby_nursery",
    title: "Nursery",
    from: "₹12k",
    image: "/images/setups/nursery.webp",
    alt: "Softly lit nursery with a crib, feeding chair and woven baskets",
  },
  {
    key: "home_gym",
    title: "Home gym",
    from: "₹2.5k",
    image: "/images/setups/gym.webp",
    alt: "Home gym corner with dumbbells, a mat and a mirror",
  },
  {
    key: "creator_studio",
    title: "Creator studio",
    from: "₹15k",
    image: "/images/setups/studio.webp",
    alt: "Creator desk with a camera, microphone and warm studio lighting",
  },
] as const;

const PROOF = [
  "Every item is a live listing from a store we track",
  "Buy-first and add-later phases, not one giant cart",
  "Gaps are shown, never papered over with placeholders",
];

/**
 * Homepage feature band for Smart Setups — the product's core idea: a room is
 * a set of decisions, not a bundle. The artwork is original DealSense imagery;
 * all prices in the builder itself come from the tracked catalogue.
 */
export function SmartSetupsTeaser() {
  return (
    <section className="py-10 sm:py-12" aria-labelledby="smart-setups-heading">
      <Container size="wide">
        <div className="relative overflow-hidden rounded-[28px] border border-hairline bg-card shadow-lift">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 -top-36 h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.14),transparent_66%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 right-1/3 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.1),transparent_66%)]"
          />

          <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-12 lg:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--dw-green-mid)]">
                  <Sparkles className="h-3 w-3" /> Smart Setups
                </span>
                <span className="rounded-full border border-hairline bg-subtle px-2.5 py-1 text-[9.5px] font-bold text-muted">
                  Our main event
                </span>
              </div>

              <h2
                id="smart-setups-heading"
                className="mt-4 text-[30px] font-extrabold leading-[1.06] tracking-[-0.04em] text-headline sm:text-[38px]"
              >
                A whole room.
                <br />
                Priced from{" "}
                <span className="text-gradient-brand">real listings.</span>
              </h2>

              <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-secondary">
                Pick a space, set one budget, and tell us what you already own. DealSense fills every
                functional slot from prices it actually tracks — then splits the spend into what to
                buy first and what can wait.
              </p>

              <ul className="mt-4 space-y-1.5">
                {PROOF.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-[11.5px] font-semibold leading-snug text-body"
                  >
                    <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/setups"
                  className="btn-cta inline-flex h-10 items-center gap-2 rounded-btn px-5 text-[12px] font-extrabold"
                >
                  <GeminiIcon className="h-3.5 w-3.5" />
                  Build my setup
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/setups#rooms"
                  className="inline-flex h-10 items-center gap-1.5 rounded-btn border border-hairline bg-card px-4 text-[11.5px] font-bold text-body transition-colors hover:border-emerald-400/40 hover:text-headline"
                >
                  <Layers className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" />
                  All 20 spaces
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9.5px] font-bold text-muted">
                <span>20 spaces · 27 quick starts</span>
                <span aria-hidden className="text-hairline-strong">·</span>
                <span>3 budget reads</span>
                <span aria-hidden className="text-hairline-strong">·</span>
                <span>0 invented products</span>
              </div>
            </div>

            {/* Room strip */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {ROOMS.map((room) => (
                <Link
                  key={room.key}
                  href={`/setups?space=${room.key}#setup-builder`}
                  className="group relative aspect-[3/4] overflow-hidden rounded-[16px] border border-hairline sm:rounded-[18px]"
                >
                  <Image
                    src={room.image}
                    alt={room.alt}
                    fill
                    sizes="(max-width: 640px) 30vw, (max-width: 1024px) 30vw, 220px"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                    <div className="text-[10px] font-extrabold leading-tight text-white sm:text-[12px]">
                      {room.title}
                    </div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[8.5px] font-bold text-emerald-200/90 sm:text-[9.5px]">
                      from {room.from}
                      <ArrowRight className="h-2.5 w-2.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </div>
                  </div>
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-white/25 bg-slate-950/35 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:right-2 sm:top-2">
                    <ArrowRight className="h-3 w-3 -rotate-45" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
