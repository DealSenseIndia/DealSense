import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Layers,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { GeminiIcon } from "@/components/ui/GeminiIcon";
import { SetupsClient } from "@/components/setups/SetupsClient";
import { buildSetupCached } from "@/lib/setups/cached";
import { getSetupMeta } from "@/lib/setups/meta";
import {
  isSetupSpace,
  SETUP_SPACES,
  SETUP_STYLES,
  SETUP_TEMPLATES,
  SETUP_TIERS,
  type SetupSpaceKey,
} from "@/lib/setups/blueprints";
import { site } from "@/lib/config";
import { cn, formatCompactINR, formatINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Smart Setups — a whole room, priced from real deals",
  description:
    "Build any room — bedroom, desk, gaming, vanity, nursery, gym, studio and more — from live listings across every store DealSense tracks. Twenty blueprints, budgets from ₹1,500 to ₹2.5L, real prices and history.",
  alternates: { canonical: "/setups" },
  openGraph: {
    title: "Smart Setups — a whole room, priced from real deals",
    description:
      "Pick a space and a budget. DealSense fills every functional slot from tracked listings — never invented products — and phases the spend.",
    url: "/setups",
    images: [{ url: "/images/setups/living.webp", width: 1536, height: 1024 }],
  },
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAGE_DEFAULT_SPACE: SetupSpaceKey = "bedroom";

const TILE_IMAGES = [
  { src: "/images/setups/bedroom.webp", alt: "Warm bedroom with a wooden bed and soft light", label: "Bedroom" },
  { src: "/images/setups/wfh.webp", alt: "Home office desk with ergonomic chair and monitor", label: "Work from home" },
  { src: "/images/setups/living.webp", alt: "Living room with warm sofa, wood table and plants", label: "Living room" },
];

export default async function SetupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    space?: string;
    budget?: string;
    owned?: string;
    style?: string;
    tier?: string;
    template?: string;
  }>;
}) {
  const sp = await searchParams;
  const chosenTemplate = sp.template
    ? SETUP_TEMPLATES.find((t) => t.slug === sp.template)
    : undefined;

  const rawSpace = sp.space ?? chosenTemplate?.space ?? "";
  const spaceKey: SetupSpaceKey = isSetupSpace(rawSpace)
    ? rawSpace
    : chosenTemplate?.space ?? PAGE_DEFAULT_SPACE;
  const space = SETUP_SPACES[spaceKey];
  const meta = getSetupMeta();

  const validOwned = new Set(space.slots.map((slot) => slot.ownedKey));
  const owned = Array.from(
    new Set(
      (sp.owned ?? "")
        .split(",")
        .map((o) => o.trim().toLowerCase())
        .filter((o) => validOwned.has(o)),
    ),
  ).slice(0, 12);

  const requestedStyle = sp.style ?? chosenTemplate?.style;
  const style = SETUP_STYLES.some((s) => s.key === requestedStyle)
    ? (requestedStyle as string)
    : "no_preference";

  const rawBudget = sp.budget ? Number(sp.budget) : NaN;
  const template = chosenTemplate ?? SETUP_TEMPLATES.find((t) => t.space === spaceKey);
  const requestedBudget =
    Number.isFinite(rawBudget) && rawBudget > 0
      ? rawBudget
      : chosenTemplate?.budget ?? template?.budget ?? space.budgetDefault;

  const initial = await buildSetupCached(spaceKey, requestedBudget, style, owned).catch(() => null);

  const initialTier = SETUP_TIERS.some((t) => t.key === sp.tier) ? sp.tier! : "value";
  const showcaseTier =
    initial?.tiers.find((t) => t.key === initialTier) ?? initial?.tiers[1] ?? null;
  const showcaseSpace = meta.spaces.find((s) => s.key === spaceKey) ?? meta.spaces[0];

  const DOMAIN_ORDER = [
    "Home",
    "Technology",
    "Lifestyle",
    "Style",
    "Family",
    "Wellness",
    "Travel",
    "Auto",
  ];
  const groupedRooms = DOMAIN_ORDER.map((domain) => ({
    domain,
    rooms: meta.spaces.filter((room) => room.domain === domain),
  })).filter((group) => group.rooms.length > 0);

  const budgetLadder = [...SETUP_TEMPLATES].sort((a, b) => a.budget - b.budget);
  const startingPrice = Math.min(...meta.spaces.map((s) => s.budgetMin));

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-hairline-soft">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-48 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.16),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-24 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.11),transparent_65%)]"
        />
        <Container size="wide" className="relative py-10 sm:py-14 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--dw-green-mid)]">
                  <Sparkles className="h-3 w-3" /> Smart Setups
                </span>
                <span className="rounded-full border border-hairline bg-card px-3 py-1 text-[10px] font-bold text-secondary">
                  New · the room builder
                </span>
              </div>

              <h1 className="mt-5 text-[32px] font-extrabold leading-[1.06] tracking-[-0.04em] text-headline sm:text-[52px]">
                A room that works.
                <br />
                Priced from{" "}
                <span className="text-gradient-brand">real deals.</span>
              </h1>

              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-secondary sm:text-[15px]">
                Twenty rooms, from a ₹{startingPrice.toLocaleString("en-IN")} tea corner to a
                ₹2,50,000 home cinema. Pick a space and a budget — we fill every functional slot
                from listings DealSense actually tracks, then tell you which ones to buy first.
                Phase 1 gets you living there. Phase 2 makes it yours.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="#setup-builder"
                  className="btn-cta inline-flex h-11 items-center gap-2 rounded-btn px-5 text-[13px] font-extrabold"
                >
                  <GeminiIcon className="h-4 w-4" />
                  Build my setup
                  <ArrowDown className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="#rooms"
                  className="inline-flex h-11 items-center gap-2 rounded-btn border border-hairline bg-card px-5 text-[13px] font-bold text-body transition-colors hover:border-emerald-400/40 hover:text-headline"
                >
                  See all {meta.spaces.length} spaces
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10.5px] font-bold text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" /> Real listings only
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" /> Price history included
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" /> No sign-up, no saved draft
                </span>
              </div>

              <div className="mt-8 grid max-w-xl grid-cols-3 gap-2.5">
                <HeroStat
                  value={initial ? `${initial.catalogueSize}` : "100+"}
                  label="tracked listings searched"
                />
                <HeroStat
                  value={`${meta.spaces.length}`}
                  label="rooms, each with its own slots"
                />
                <HeroStat value="0" label="invented products or prices" />
              </div>
            </div>

            {/* Collage */}
            <div className="relative">
              <div className="grid grid-cols-2 grid-rows-[132px_132px] gap-3 sm:grid-rows-[178px_178px]">
                <div className="relative row-span-2 overflow-hidden rounded-[22px] border border-hairline shadow-lift">
                  <Image
                    src={TILE_IMAGES[0].src}
                    alt={TILE_IMAGES[0].alt}
                    fill
                    priority
                    sizes="(max-width: 1024px) 45vw, 300px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/5 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-slate-950/45 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-white backdrop-blur">
                    {TILE_IMAGES[0].label}
                  </span>
                </div>

                {TILE_IMAGES.slice(1).map((tile) => (
                  <div
                    key={tile.src}
                    className="relative overflow-hidden rounded-[22px] border border-hairline shadow-card"
                  >
                    <Image
                      src={tile.src}
                      alt={tile.alt}
                      fill
                      priority
                      sizes="(max-width: 1024px) 45vw, 240px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/58 via-transparent to-transparent" />
                    <span className="absolute bottom-2.5 left-3 text-[10px] font-extrabold text-white">
                      {tile.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live proof card */}
              <div className="relative mt-3 rounded-2xl border border-white/40 bg-[var(--bg-card)]/95 p-3.5 shadow-lift backdrop-blur-xl sm:absolute sm:-bottom-5 sm:left-5 sm:right-auto sm:mt-0 sm:min-w-[290px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted">
                      {showcaseSpace.title} · {showcaseTier?.label ?? "Best value"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                      <span className="tabular text-[20px] font-extrabold leading-none text-headline">
                        {showcaseTier ? formatINR(showcaseTier.totalPrice) : "Real prices"}
                      </span>
                      {showcaseTier && (
                        <span className="text-[9.5px] font-bold text-[var(--dw-green-mid)]">
                          {showcaseTier.completeness.filled}/{showcaseTier.completeness.slotsTotal} slots
                        </span>
                      )}
                    </div>
                  </div>
                  {showcaseTier && showcaseTier.setupScore !== null ? (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-emerald-400/45 bg-[var(--dw-green-surface)]">
                      <span className="tabular text-[13px] font-extrabold text-[var(--dw-green-mid)]">
                        {showcaseTier.setupScore}
                      </span>
                    </div>
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
                      <Layers className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Composed now from recorded multi-store prices
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Builder + results ───────────────────────────────────────── */}
      <section className="relative py-10 sm:py-12">
        <Container size="wide">
          <div id="setup-builder" className="scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
                  Build it
                </span>
                <h2 className="mt-1 text-[27px] font-extrabold tracking-[-0.03em] text-headline sm:text-[33px]">
                  Start with the room you actually have.
                </h2>
              </div>
              <p className="max-w-md text-[12px] leading-relaxed text-secondary">
                Every result is composed at request time. Change the budget, keep what you already
                own, and the whole room reprices.
              </p>
            </div>

            <SetupsClient
              meta={meta}
              initial={initial}
              initialInput={{
                space: spaceKey,
                budget: initial?.requestedBudget ?? requestedBudget,
                owned,
                style,
                tier: initialTier,
              }}
              baseUrl={site.url}
            />
          </div>
        </Container>
      </section>

      {/* ── Room gallery ────────────────────────────────────────────── */}
      <section id="rooms" className="scroll-mt-24 border-t border-hairline-soft bg-subtle/50 py-12">
        <Container size="wide">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
                {meta.spaces.length} blueprints · 8 domains
              </span>
              <h2 className="mt-1 text-[27px] font-extrabold tracking-[-0.03em] text-headline sm:text-[32px]">
                Every room, not just the obvious three.
              </h2>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-secondary">
                A nursery, a pooja corner, a balcony garden, a creator desk. Each one is a blueprint
                of functional slots — not a mood board. Pick any and the builder opens with its own
                sensible starting budget.
              </p>
            </div>
            <Link
              href={`/setups?space=${spaceKey}&budget=${space.budgetDefault}#setup-builder`}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              Rebuild this room <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {groupedRooms.map((group) => (
              <a
                key={group.domain}
                href={`#rooms-${group.domain.toLowerCase()}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-1.5 text-[10.5px] font-extrabold text-secondary transition-colors hover:border-emerald-400/40 hover:text-headline"
              >
                {group.domain}
                <span className="tabular text-[9px] text-muted">{group.rooms.length}</span>
              </a>
            ))}
          </div>

          {groupedRooms.map((group) => (
            <div
              key={group.domain}
              id={`rooms-${group.domain.toLowerCase()}`}
              className="mt-8 scroll-mt-24"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-headline">
                  {group.domain}
                </h3>
                <span className="text-[9.5px] font-bold text-muted">
                  {group.rooms.length} {group.rooms.length === 1 ? "space" : "spaces"}
                </span>
                <div className="h-px flex-1 bg-hairline" />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {group.rooms.map((room) => {
                  const active = room.key === spaceKey;
                  return (
                    <Link
                      key={room.key}
                      href={`/setups?space=${room.key}&budget=${room.budgetDefault}#setup-builder`}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift",
                        active
                          ? "border-emerald-400/55 ring-1 ring-emerald-400/20"
                          : "border-hairline hover:border-emerald-400/35",
                      )}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <Image
                          src={room.image}
                          alt={room.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 290px"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/12 to-transparent" />
                        <div className="absolute inset-x-3 bottom-2.5">
                          <h4 className="text-[14.5px] font-extrabold leading-tight tracking-[-0.015em] text-white">
                            {room.title}
                          </h4>
                        </div>
                        {active && (
                          <span className="absolute right-2.5 top-2.5 rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur">
                            Building now
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="line-clamp-1 text-[10px] leading-relaxed text-secondary">
                          {room.tagline}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-hairline-soft pt-2">
                          <span className="text-[9px] font-bold text-muted">
                            {room.essentialCount} essentials ·{" "}
                            {room.slotCount - room.essentialCount} finishing
                          </span>
                          <span className="tabular text-[9.5px] font-extrabold text-headline">
                            from {formatCompactINR(room.budgetMin)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-7 rounded-2xl border border-hairline bg-card p-4">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Room guides</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-secondary">
              Every room also has a shareable page with the full build, the slots it leaves open, and a
              link into each product&apos;s recorded price history.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meta.spaces.map((s) => (
                <Link
                  key={s.key}
                  href={`/setups/${s.key}`}
                  className="inline-flex rounded-full border border-hairline bg-subtle px-2.5 py-1 text-[10.5px] font-bold text-secondary transition-colors hover:border-emerald-400/40 hover:text-headline"
                >
                  {s.title}
                </Link>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] leading-relaxed text-muted">
            Space images are original DealSense illustrations. Products and prices in a build are
            always taken from live listings in stores we track — not from these images.
          </p>
        </Container>
      </section>

      {/* ── Budget ladder ───────────────────────────────────────────── */}
      <section id="budgets" className="scroll-mt-24 py-12">
        <Container size="wide">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
                {budgetLadder.length} quick starts
              </span>
              <h2 className="mt-1 text-[27px] font-extrabold tracking-[-0.03em] text-headline sm:text-[32px]">
                Every budget has a starting point.
              </h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-secondary">
                Not sure where to begin? Pick a number. Each quick start opens the builder with a
                space, a ceiling and a style already set — then re-prices the whole room from live
                listings. You can change any of it.
              </p>
            </div>
            <span className="rounded-full border border-hairline bg-card px-3 py-1.5 text-[10px] font-bold text-muted">
              ₹1,500 to ₹2,50,000
            </span>
          </div>

          <div className="mt-6 space-y-6">
            {[
              { label: "Under ₹10,000", min: 0, max: 9_999 },
              { label: "₹10,000 – ₹40,000", min: 10_000, max: 39_999 },
              { label: "₹40,000 – ₹1,00,000", min: 40_000, max: 99_999 },
              { label: "₹1,00,000 and above", min: 100_000, max: Infinity },
            ].map((band) => {
              const templates = budgetLadder.filter(
                (t) => t.budget >= band.min && t.budget <= band.max,
              );
              if (!templates.length) return null;
              return (
                <div key={band.label}>
                  <div className="flex items-center gap-3">
                    <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-headline">
                      {band.label}
                    </h3>
                    <div className="h-px flex-1 bg-hairline" />
                    <span className="text-[9.5px] font-bold text-muted">
                      {templates.length} blueprints
                    </span>
                  </div>
                  <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((t) => {
                      const room = meta.spaces.find((s) => s.key === t.space);
                      return (
                        <Link
                          key={t.slug}
                          href={`/setups?template=${t.slug}#setup-builder`}
                          title={t.blurb}
                          className="group flex items-start justify-between gap-3 rounded-xl border border-hairline bg-card px-3.5 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-emerald-400/40 hover:shadow-lift"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="tabular rounded-md border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[var(--dw-green-mid)]">
                                {formatCompactINR(t.budget)}
                              </span>
                              <span className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-muted">
                                {room?.title ?? t.space}
                              </span>
                            </div>
                            <div className="mt-1 text-[12px] font-extrabold leading-tight text-headline">
                              {t.title}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[10px] leading-relaxed text-muted">
                              {t.blurb}
                            </p>
                          </div>
                          <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-[var(--dw-green-mid)]" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-[10px] leading-relaxed text-muted">
            These are starting budgets, not quotes. A build can land under or over its ceiling
            depending on live prices — the exact total and every substitution is shown before you
            click through.
          </p>
        </Container>
      </section>

      {/* ── Closing statement ───────────────────────────────────────── */}
      <section className="py-12">
        <Container size="wide">
          <div className="relative overflow-hidden rounded-[26px] border border-emerald-950/10 bg-[linear-gradient(120deg,#052e22_0%,#064e3b_55%,#065f46_100%)] px-6 py-9 text-white shadow-lift sm:px-10">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl"
            />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-300/80">
                  Why we built this
                </div>
                <h2 className="mt-1.5 max-w-2xl text-[24px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">
                  A bundle is a discount. A setup is a decision about how you live.
                </h2>
                <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-emerald-100/70">
                  DealSense starts from the room and works backwards: which slots matter, what phase
                  they belong to, and which tracked price is actually defensible. If the catalogue
                  cannot fill a slot, you see the gap and the reason — never a placeholder.
                </p>
              </div>
              <Link
                href="#setup-builder"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-btn bg-white px-5 text-[12.5px] font-extrabold text-emerald-950 transition-transform hover:-translate-y-0.5"
              >
                <GeminiIcon className="h-4 w-4" />
                Build yours
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-card px-3 py-2.5 shadow-card">
      <div className="tabular text-[19px] font-extrabold leading-none text-headline">{value}</div>
      <div className="mt-1 text-[8.5px] font-bold uppercase leading-tight tracking-[0.06em] text-muted">
        {label}
      </div>
    </div>
  );
}
