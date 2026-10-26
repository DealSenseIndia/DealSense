"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  BedDouble,
  BookOpen,
  Camera,
  Car,
  Check,
  ChevronDown,
  Coffee,
  Dumbbell,
  Flame,
  Gamepad2,
  Gift,
  Layers,
  Leaf,
  Loader2,
  Luggage,
  Monitor,
  PawPrint,
  RotateCcw,
  ShieldCheck,
  Shirt,
  Sofa,
  Sparkles,
  Tv,
  Wallet,
} from "lucide-react";
import { GeminiIcon } from "@/components/ui/GeminiIcon";
import type { SetupBuildResult } from "@/lib/setups/engine";
import type { SetupMeta, SetupSpaceMeta } from "@/lib/setups/meta";
import { SetupResults } from "./SetupResults";
import { cn, formatCompactINR, formatINR } from "@/lib/utils";

interface InitialInput {
  space: string;
  budget: number;
  owned: string[];
  style: string;
  tier: string;
}

const SPACE_ICONS: Record<string, typeof BedDouble> = {
  bed: BedDouble,
  desk: Monitor,
  gamepad: Gamepad2,
  book: BookOpen,
  sofa: Sofa,
  coffee: Coffee,
  sparkles: Sparkles,
  shirt: Shirt,
  baby: Baby,
  dumbbell: Dumbbell,
  cup: Coffee,
  luggage: Luggage,
  leaf: Leaf,
  paw: PawPrint,
  camera: Camera,
  car: Car,
  gift: Gift,
  tv: Tv,
  flame: Flame,
};

/**
 * A tiny, abstract room for each direction. These are deliberately not product
 * photos — they show the palette and material story the scoring will prefer.
 */
const STYLE_PREVIEWS: Record<
  string,
  {
    wall: string;
    floor: string;
    furniture: string;
    accent: string;
    light: string;
    overlay?: string;
    overlaySize?: string;
    caption: string;
  }
> = {
  modern_minimal: {
    wall: "linear-gradient(180deg,#f8fafc 0%,#eef2f6 100%)",
    floor: "#dbe3ea",
    furniture: "#94a3b8",
    accent: "#0f172a",
    light: "#10b981",
    overlay:
      "repeating-linear-gradient(90deg,rgba(100,116,139,0.13) 0 1px,transparent 1px 13px)",
    caption: "Light · clean · green accent",
  },
  warm_cosy: {
    wall: "linear-gradient(180deg,#f6ecdf 0%,#ead6c0 100%)",
    floor: "#c99e75",
    furniture: "#a4714b",
    accent: "#7c4a2d",
    light: "#f4b860",
    overlay:
      "radial-gradient(circle at 78% 22%,rgba(244,184,96,0.45) 0 18px,transparent 19px)",
    caption: "Wood · linen · warm glow",
  },
  dark_architectural: {
    wall: "linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",
    floor: "#0b1220",
    furniture: "#475569",
    accent: "#94a3b8",
    light: "#34d399",
    overlay:
      "repeating-linear-gradient(90deg,rgba(148,163,184,0.16) 0 1px,transparent 1px 16px)",
    caption: "Charcoal · metal · emerald",
  },
  no_preference: {
    wall: "linear-gradient(120deg,#f8fafc 0%,#f1f5f9 50%,#ecfdf5 100%)",
    floor: "#d1d9e0",
    furniture: "#94a3b8",
    accent: "#10b981",
    light: "#facc15",
    overlay:
      "repeating-linear-gradient(135deg,rgba(148,163,184,0.12) 0 8px,transparent 8px 16px)",
    caption: "Price evidence decides",
  },
};

function StyleRoomPreview({ styleKey }: { styleKey: string }) {
  const p = STYLE_PREVIEWS[styleKey] ?? STYLE_PREVIEWS.no_preference;
  return (
    <span aria-hidden="true" className="relative block h-[52px] overflow-hidden rounded-lg">
      <span className="absolute inset-0" style={{ background: p.wall }} />
      <span
        className="absolute inset-0 opacity-80"
        style={{ backgroundImage: p.overlay, backgroundSize: p.overlaySize }}
      />
      {/* floor */}
      <span className="absolute inset-x-0 bottom-0 h-[36%] opacity-90" style={{ background: p.floor }} />
      {/* low sofa / console */}
      <span
        className="absolute bottom-[27%] left-[12%] h-[31%] w-[42%] rounded-t-[9px] shadow-sm"
        style={{ background: p.furniture }}
      />
      <span
        className="absolute bottom-[27%] left-[19%] h-[10%] w-[28%] rounded-t-[6px] opacity-70"
        style={{ background: p.accent }}
      />
      {/* side table */}
      <span
        className="absolute bottom-[27%] right-[18%] h-[23%] w-[8%] rounded-[2px]"
        style={{ background: p.accent }}
      />
      {/* lamp glow */}
      <span
        className="absolute right-[14%] top-[16%] h-2.5 w-2.5 rounded-full shadow-[0_0_10px_currentColor]"
        style={{ background: p.light, color: p.light }}
      />
      <span
        className="absolute right-[15.1%] top-[30%] h-[14%] w-[0.5px] opacity-40"
        style={{ background: p.accent }}
      />
      <span
        className="absolute inset-x-0 bottom-0 h-[1px] opacity-50"
        style={{ background: p.accent }}
      />
    </span>
  );
}

function quickBudgets(space: SetupSpaceMeta): number[] {
  const raw = [
    space.budgetDefault * 0.7,
    space.budgetDefault,
    space.budgetDefault * 1.5,
    space.budgetDefault * 2.2,
  ];
  const step = space.budgetMax > 120_000 ? 5_000 : 1_000;
  const rounded = raw.map((v) => Math.round(v / step) * step);
  const unique = Array.from(
    new Set(
      rounded
        .filter((v) => v >= Math.max(space.budgetMin, 1_000) && v <= space.budgetMax)
        .concat(space.budgetDefault),
    ),
  ).sort((a, b) => a - b);
  return unique.slice(0, 4);
}

export function SetupsClient({
  meta,
  initial,
  initialInput,
  baseUrl,
}: {
  meta: SetupMeta;
  initial: SetupBuildResult | null;
  initialInput: InitialInput;
  baseUrl: string;
}) {
  const [spaceKey, setSpaceKey] = useState(initialInput.space);
  const [budget, setBudget] = useState(initialInput.budget);
  const [owned, setOwned] = useState<string[]>(initialInput.owned);
  const [style, setStyle] = useState(initialInput.style);
  const [tierKey, setTierKey] = useState(initialInput.tier);

  const [setup, setSetup] = useState<SetupBuildResult | null>(initial);
  const [loading, setLoading] = useState(false);
  const [applyingStyle, setApplyingStyle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastBuilt, setLastBuilt] = useState<InitialInput | null>(
    initial ? initialInput : null,
  );
  const [shareParams, setShareParams] = useState(() =>
    buildParams(initialInput.space, initialInput.budget, initialInput.owned, initialInput.style),
  );

  const resultsRef = useRef<HTMLDivElement>(null);
  const buildSeq = useRef(0);
  const [domain, setDomain] = useState("All");

  const domains = useMemo(
    () => ["All", ...Array.from(new Set(meta.spaces.map((s) => s.domain)))],
    [meta.spaces],
  );

  const activeSpace = useMemo(
    () => meta.spaces.find((s) => s.key === spaceKey) ?? meta.spaces[0],
    [meta.spaces, spaceKey],
  );

  const visibleSpaces = useMemo(
    () => (domain === "All" ? meta.spaces : meta.spaces.filter((s) => s.domain === domain)),
    [meta.spaces, domain],
  );

  const options = useMemo(() => quickBudgets(activeSpace), [activeSpace]);
  const budgetPct =
    activeSpace.budgetMax > activeSpace.budgetMin
      ? ((budget - activeSpace.budgetMin) / (activeSpace.budgetMax - activeSpace.budgetMin)) * 100
      : 0;
  const step = activeSpace.budgetMax > 120_000 ? 2_500 : 500;

  const configDirty = useMemo(() => {
    if (!lastBuilt) return false;
    return (
      lastBuilt.space !== spaceKey ||
      lastBuilt.budget !== budget ||
      lastBuilt.style !== style ||
      lastBuilt.owned.join(",") !== owned.join(",")
    );
  }, [lastBuilt, spaceKey, budget, style, owned]);

  const shareUrl = `${baseUrl.replace(/\/$/, "")}/setups?${shareParams.toString()}`;

  function selectSpace(nextKey: string) {
    const next = meta.spaces.find((s) => s.key === nextKey);
    if (!next) return;
    setSpaceKey(nextKey);
    setBudget(next.budgetDefault);
    setOwned((prev) => prev.filter((k) => next.ownedOptions.some((o) => o.key === k)));
  }

  function toggleOwned(key: string) {
    setOwned((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function build(
    overrides?: Partial<InitialInput>,
    options?: { keepTier?: boolean; scroll?: boolean; applyingStyle?: string },
  ) {
    const requestId = ++buildSeq.current;
    const nextSpace = overrides?.space ?? spaceKey;
    const nextBudget = overrides?.budget ?? budget;
    const nextOwned = overrides?.owned ?? owned;
    const nextStyle = overrides?.style ?? style;
    const nextTier = options?.keepTier ? tierKey : "value";

    setLoading(true);
    if (options?.applyingStyle) setApplyingStyle(options.applyingStyle);
    setError(null);
    try {
      const res = await fetch("/api/setups/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space: nextSpace,
          budget: nextBudget,
          owned: nextOwned,
          style: nextStyle,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; setup: SetupBuildResult }
        | { ok: false; error?: string };
      if (requestId !== buildSeq.current) return;
      if (!res.ok || !json.ok) {
        throw new Error(
          ("error" in json && json.error) ||
            "The setup engine could not build this right now. Nothing has been substituted.",
        );
      }

      setSetup(json.setup);
      setTierKey(nextTier);
      const nextLast: InitialInput = {
        space: nextSpace,
        budget: nextBudget,
        owned: nextOwned,
        style: nextStyle,
        tier: nextTier,
      };
      setLastBuilt(nextLast);
      const params = buildParams(nextSpace, nextBudget, nextOwned, nextStyle);
      setShareParams(params);
      window.history.replaceState(null, "", `/setups?${params.toString()}`);
      if (options?.scroll !== false) {
        window.setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    } catch (err) {
      if (requestId !== buildSeq.current) return;
      setError((err as Error).message || "Something went wrong building this setup.");
    } finally {
      if (requestId === buildSeq.current) {
        setLoading(false);
        setApplyingStyle(null);
      }
    }
  }

  function chooseStyle(nextStyle: string) {
    if (nextStyle === style) return;
    setStyle(nextStyle);
    // Re-rank the build that is on screen straight away, preserving the tier
    // the reader was looking at. Unsaved budget/space edits are left untouched
    // until they press Generate.
    if (setup && lastBuilt) {
      void build(
        {
          space: lastBuilt.space,
          budget: lastBuilt.budget,
          owned: lastBuilt.owned,
          style: nextStyle,
        },
        { keepTier: true, scroll: false, applyingStyle: nextStyle },
      );
    }
  }

  function applyTemplate(t: SetupMeta["examples"][number]) {
    const space = meta.spaces.find((s) => s.key === t.space);
    if (!space) return;
    const nextOwned: string[] = [];
    setSpaceKey(t.space);
    setBudget(t.budget);
    setStyle(t.style);
    setOwned(nextOwned);
    void build({ space: t.space, budget: t.budget, owned: nextOwned, style: t.style });
  }

  const SpaceIcon = SPACE_ICONS[activeSpace.icon] ?? Sparkles;
  const shownBudget = Math.min(
    Math.max(budget, activeSpace.budgetMin),
    activeSpace.budgetMax,
  );

  return (
    <>
      <div
        id="setup-builder"
        className="scroll-mt-24 overflow-hidden rounded-[26px] border border-hairline bg-card shadow-lift"
      >
        {/* Builder head */}
        <div className="flex flex-col gap-4 border-b border-hairline bg-[linear-gradient(120deg,rgba(16,185,129,0.07),rgba(45,212,191,0.035)_46%,transparent)] px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
              <Sparkles className="h-3.5 w-3.5" /> The builder
            </span>
            <h2 className="mt-1 text-[21px] font-extrabold tracking-[-0.025em] text-headline sm:text-[24px]">
              Four choices. We price the rest.
            </h2>
            <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-secondary">
              No account, no saved draft, no invented recommendation. Every result is composed at
              request time from the listings we currently track.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-card px-2.5 py-1 text-[9.5px] font-bold text-secondary">
              <ShieldCheck className="h-3 w-3 text-[var(--dw-green-mid)]" /> Real listings only
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-card px-2.5 py-1 text-[9.5px] font-bold text-secondary">
              <Layers className="h-3 w-3 text-[var(--dw-green-mid)]" /> 3 budget tiers
            </span>
          </div>
        </div>

        {/* Starter templates */}
        <div className="flex items-center gap-2 overflow-hidden border-b border-hairline-soft px-4 py-3 sm:px-6">
          <span className="shrink-0 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
            Quick starts
          </span>
          <div className="-mr-2 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-2 pb-0.5">
            {meta.examples.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => applyTemplate(t)}
                disabled={loading}
                title={t.blurb}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-elevated/60 px-2.5 py-1 text-[10px] font-bold text-secondary transition-all hover:border-emerald-400/40 hover:text-headline disabled:opacity-50"
              >
                {t.title}
                <ArrowRight className="h-2.5 w-2.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
          {/* Step 1 — space */}
          <div className="rounded-2xl border border-hairline-soft bg-subtle/60 p-4">
            <StepHead
              n={1}
              title="Pick a space"
              hint={`${meta.spaces.length} blueprints, each with its own functional slots.`}
            />
            <div className="mt-2.5 flex gap-1 overflow-x-auto pb-0.5">
              {domains.map((d) => {
                const on = domain === d;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDomain(d)}
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-extrabold transition-colors",
                      on
                        ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                        : "border-hairline bg-card text-secondary hover:text-headline",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="-mx-1 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
              {visibleSpaces.map((s) => {
                const Icon = SPACE_ICONS[s.icon] ?? Sparkles;
                const selected = s.key === spaceKey;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectSpace(s.key)}
                    className={cn(
                      "group relative w-[116px] shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-all duration-200",
                      selected
                        ? "border-emerald-400/65 bg-card shadow-[0_8px_24px_-16px_rgba(16,185,129,0.8)]"
                        : "border-hairline bg-card hover:border-emerald-400/35",
                    )}
                  >
                    <span className="relative block h-[62px] w-full overflow-hidden bg-elevated">
                      <Image
                        src={s.image}
                        alt={s.title}
                        fill
                        sizes="160px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
                      {selected && (
                        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-emerald-700 shadow">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="flex items-start gap-1.5 px-2 py-1.5">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dw-green-mid)]" />
                      <span className="line-clamp-2 min-h-[27px] min-w-0 flex-1 text-[10.5px] font-extrabold leading-tight text-headline">
                        {s.title}
                      </span>
                    </span>
                    <span className="block px-2 pb-2 text-[8.5px] font-semibold text-muted">
                      from {formatCompactINR(s.budgetMin)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 line-clamp-2 text-[10px] leading-relaxed text-muted">
              <span className="font-extrabold text-headline">{activeSpace.domain}</span> ·{" "}
              {activeSpace.description}
            </p>
          </div>

          {/* Step 2 — budget */}
          <div className="flex flex-col rounded-2xl border border-hairline-soft bg-subtle/60 p-4">
            <StepHead n={2} title="Set your total budget" hint="Deduct what you own later — not here." />
            <div className="mt-3 rounded-xl border border-hairline bg-card p-3.5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted">
                    Your ceiling
                  </div>
                  <div className="tabular mt-0.5 text-[30px] font-extrabold leading-none tracking-[-0.03em] text-headline">
                    {formatINR(shownBudget)}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-1 text-right">
                  <div className="text-[8px] font-extrabold uppercase tracking-[0.1em] text-[var(--dw-green-mid)]">
                    {activeSpace.domain}
                  </div>
                  <div className="text-[9px] font-bold text-secondary">All tracked stores</div>
                </div>
              </div>

              <input
                type="range"
                aria-label="Total setup budget"
                min={activeSpace.budgetMin}
                max={activeSpace.budgetMax}
                step={step}
                value={shownBudget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="setup-range mt-4 w-full"
                style={{ "--pct": `${Math.max(0, Math.min(100, budgetPct))}%` } as React.CSSProperties}
              />
              <div className="mt-1.5 flex justify-between text-[8.5px] font-bold text-muted">
                <span>{formatCompactINR(activeSpace.budgetMin)}</span>
                <span>{formatCompactINR(activeSpace.budgetMax)}</span>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {options.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBudget(v)}
                    className={cn(
                      "tabular rounded-full border px-2.5 py-1 text-[9.5px] font-extrabold transition-colors",
                      Math.abs(shownBudget - v) < step
                        ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                        : "border-hairline bg-card text-secondary hover:text-headline",
                    )}
                  >
                    {formatCompactINR(v)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-auto flex items-start gap-1.5 pt-3 text-[9.5px] leading-relaxed text-muted">
              <Wallet className="mt-0.5 h-3 w-3 shrink-0 text-[var(--dw-green-mid)]" />
              We aim below your budget at the saver tier, at it for best value, and around 1.35×
              for the step-up build. The exact totals are shown before you click anything.
            </div>
          </div>

          {/* Step 3 — owned */}
          <div className="rounded-2xl border border-hairline-soft bg-subtle/60 p-4">
            <StepHead
              n={3}
              title="What do you already own?"
              hint="Those slots are removed and their share is spread across the rest."
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {activeSpace.ownedOptions.map((o) => {
                const on = owned.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleOwned(o.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition-colors",
                      on
                        ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                        : "border-hairline bg-card text-secondary hover:border-emerald-400/30 hover:text-headline",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-3.5 w-3.5 place-items-center rounded-full border",
                        on ? "border-transparent bg-[var(--dw-green-main)] text-white" : "border-hairline-strong",
                      )}
                    >
                      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-hairline-soft bg-card px-2.5 py-2">
              <span className="text-[9.5px] leading-snug text-muted">
                {owned.length === 0
                  ? "None selected — we will price every slot."
                  : `${owned.length} ${owned.length === 1 ? "item" : "items"} kept out of the build.`}
              </span>
              {owned.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOwned([])}
                  className="inline-flex shrink-0 items-center gap-1 text-[9px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
                >
                  <RotateCcw className="h-2.5 w-2.5" /> Reset
                </button>
              )}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">
              We deliberately do not add a rupee value for what you already own. We never knew its
              price; inventing one would make the savings line look better than it is.
            </p>
          </div>

          {/* Step 4 — style */}
          <div className="flex flex-col rounded-2xl border border-hairline-soft bg-subtle/60 p-4">
            <StepHead
              n={4}
              title="Pick a design direction"
              hint={setup ? "Tap a look — the build on screen re-ranks instantly." : "Shown as a palette, never as a fake product photo."}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {meta.styles.map((s) => {
                const on = s.key === style;
                const preview = STYLE_PREVIEWS[s.key] ?? STYLE_PREVIEWS.no_preference;
                const applying = applyingStyle === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={on}
                    aria-busy={applying}
                    aria-label={`${s.label} — ${s.description}`}
                    onClick={() => chooseStyle(s.key)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border p-1.5 text-left transition-all duration-200",
                      on
                        ? "border-emerald-400/70 bg-[var(--dw-green-surface)] shadow-[0_10px_28px_-20px_rgba(16,185,129,0.9)] ring-1 ring-emerald-400/30"
                        : "border-hairline bg-card hover:-translate-y-0.5 hover:border-emerald-400/40 hover:shadow-[0_10px_22px_-20px_rgba(16,185,129,0.7)]",
                    )}
                  >
                    <span className="relative block">
                      <StyleRoomPreview styleKey={s.key} />
                      {on && (
                        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_2px_8px_rgba(4,120,87,0.4)]">
                          <Check className="h-3 w-3" strokeWidth={3.5} />
                        </span>
                      )}
                      {applying && (
                        <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/25 backdrop-blur-[1px]">
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        </span>
                      )}
                    </span>
                    <span className="mt-2 flex items-start justify-between gap-1 px-0.5">
                      <span className="text-[10.5px] font-extrabold leading-tight text-headline">
                        {s.label}
                      </span>
                      <span
                        className={cn(
                          "mt-[1px] shrink-0 rounded-full px-1.5 py-[2px] text-[7px] font-extrabold uppercase tracking-[0.08em]",
                          on
                            ? "bg-emerald-500/15 text-[var(--dw-green-mid)]"
                            : "bg-elevated text-muted",
                        )}
                      >
                        {on ? "Selected" : preview.caption.split(" · ")[0]}
                      </span>
                    </span>
                    <span className="mt-0.5 block px-0.5 text-[8.5px] leading-snug text-muted">
                      {preview.caption}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-auto flex items-start gap-1.5 pt-3 text-[9px] leading-relaxed text-muted">
              <SpaceIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--dw-green-mid)]" />
              {setup
                ? "Your tier stays put. The look only re-ranks products that already fit the budget and the deal evidence."
                : "The look only breaks ties between products that already fit the budget and the deal evidence. It can never outrank a bad price."}
            </div>
          </div>
        </div>

        {/* Generate */}
        <div className="flex flex-col gap-3 border-t border-hairline bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-[10px] leading-relaxed text-muted">
            <span className="font-extrabold text-headline">Free, no sign-in.</span> The result is
            recomposed from current observations each time.{" "}
            {setup ? `${setup.catalogueSize} tracked listings searched.` : ""}
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {configDirty && (
              <span className="text-center text-[9.5px] font-bold text-amber-600 dark:text-amber-300">
                Selections changed
              </span>
            )}
            <button
              type="button"
              id="generate-setup-btn"
              onClick={() => void build()}
              disabled={loading}
              aria-busy={loading}
              className="btn-cta inline-flex h-11 min-w-[250px] items-center justify-center gap-2 rounded-btn px-5 text-[12.5px] font-extrabold"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Composing from real prices…
                </>
              ) : (
                <>
                  <GeminiIcon className="h-4 w-4" />
                  Generate deal-verified setup
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/35 bg-red-500/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div>
            <div className="text-[11.5px] font-extrabold text-red-700 dark:text-red-300">
              Couldn&apos;t build this setup
            </div>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-secondary">{error}</p>
            <button
              type="button"
              onClick={() => void build()}
              className="mt-1.5 text-[10px] font-extrabold text-red-700 underline underline-offset-2 dark:text-red-300"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div ref={resultsRef} className="scroll-mt-24">
        {setup ? (
          <div className="mt-9">
            <SetupResults
              setup={setup}
              tierKey={tierKey}
              onTierChange={setTierKey}
              configDirty={configDirty}
              shareUrl={shareUrl}
            />
          </div>
        ) : (
          <div className="mt-9 rounded-card border border-dashed border-hairline-strong bg-subtle p-10 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-[var(--dw-green-mid)]" />
            <h3 className="mt-2 text-[16px] font-extrabold text-headline">
              Your setup will appear here
            </h3>
            <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-relaxed text-secondary">
              Pick a space and budget above, then generate. If the tracked catalogue cannot fill a
              slot, you will see the gap and the reason — never a placeholder product.
            </p>
          </div>
        )}
      </div>

      {/* Method strip */}
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        <MethodCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Real listings, real observations"
          body="Every item is a live listing from a store we track, with real recorded price points behind it. Missing history is flagged, never papered over."
        />
        <MethodCard
          icon={<Layers className="h-4 w-4" />}
          title="Phased on purpose"
          body="Phase 1 is what the space needs to function. Phase 2 is what makes it feel finished. Buying in that order protects you from a pretty room with no bed."
        />
        <MethodCard
          icon={<Wallet className="h-4 w-4" />}
          title="One budget, three honest reads"
          body="Saver, best value and step-up are three allocations of the same blueprint. The score shows coverage, budget fit, evidence and deal quality — with its formula visible."
        />
      </div>

      <details className="group mt-4 rounded-xl border border-hairline bg-card">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[11.5px] font-extrabold text-headline">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" />
            How a setup is selected — the short, honest version
          </span>
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-hairline-soft px-4 py-4 text-[10.5px] leading-relaxed text-secondary">
          <p>
            Each slot gets a target spend derived from its share of the blueprint. We collect every
            tracked listing that matches the slot and falls inside that slot&apos;s price envelope,
            then rank candidates by budget fit (45%), the same deal score used on product pages
            (35%), style affinity (10%) and price evidence (10%). Ties go to the cheaper listing,
            then the older listing id, so the same inputs always produce the same setup.
          </p>
          <p className="mt-2">
            Nothing is persisted per visitor. A shared link re-runs the composition against the
            catalogue as it exists when the next person opens it, which is why a price can differ
            from the one in a screenshot.
          </p>
        </div>
      </details>
    </>
  );
}

function buildParams(space: string, budget: number, owned: string[], style: string): URLSearchParams {
  const p = new URLSearchParams({ space, budget: String(Math.round(budget)) });
  if (owned.length) p.set("owned", owned.join(","));
  if (style && style !== "no_preference") p.set("style", style);
  return p;
}

function StepHead({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[10px] font-extrabold text-[var(--dw-green-mid)] ring-1 ring-[var(--dw-green-border)]">
          {n}
        </span>
        <h3 className="text-[12.5px] font-extrabold tracking-[-0.01em] text-headline">{title}</h3>
      </div>
      <p className="mt-0.5 pl-7 text-[9.5px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

function MethodCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-card p-3.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
        {icon}
      </div>
      <h3 className="mt-2 text-[11.5px] font-extrabold text-headline">{title}</h3>
      <p className="mt-1 text-[10px] leading-relaxed text-secondary">{body}</p>
    </div>
  );
}
