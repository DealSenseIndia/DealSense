"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ProductOptions as Options } from "@/lib/db/variants";
import type { VariantSibling } from "@/lib/db/variantSiblings";
import { cn, formatINR } from "@/lib/utils";

/** How many chips to show before we hide the tail. */
const CAP = 7;

/**
 * The product's real options — the colours, sizes and configurations that
 * actually exist for it.
 *
 * Colours come first as pictures, the way a store shows them: the real photo
 * of that colour, its name, and what it costs there. Sizes and styles are
 * chips. Picking an option filters the customer reviews below to that exact
 * variant, so you can read what buyers of *that* colour said.
 */
export function ProductOptions({
  options,
  siblings = [],
  slug,
  active,
  matched,
  currentImageUrl,
  currentColour,
}: {
  options: Options;
  siblings?: VariantSibling[];
  slug: string;
  active: { key: string; value: string } | null;
  matched: number;
  currentImageUrl?: string | null;
  currentColour?: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const colourDim = options.dimensions.find((d) => d.key === "colour");
  const otherDims = options.dimensions.filter((d) => d.key !== "colour");
  const swatches = siblings.filter((s) => s.colour);

  if (!options.dimensions.length && !swatches.length) return null;

  const chipRow = (dim: (typeof options.dimensions)[number]) => {
    const isActiveDim = active?.key === dim.key;
    const shown = expanded === dim.key ? dim.values : dim.values.slice(0, CAP);
    const hidden = dim.values.length - shown.length;
    return (
      <div key={dim.key}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-extrabold text-headline">{dim.label}:</span>
          {dim.key === "styleName" ? (
            <span
              title="The name the store gives this version of the product — the pack, bundle or offer it comes with."
              className="text-[10.5px] font-semibold text-muted"
            >
              as the store names it
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {shown.map((v) => {
            const on = isActiveDim && active?.value === v.value;
            const href = `/product/${slug}?opt=${encodeURIComponent(
              `${dim.key}:${v.value}`,
            )}#reviews`;
            return (
              <Link
                key={v.value}
                href={href}
                scroll={false}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                  on
                    ? "border-emerald-500/60 bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)] ring-1 ring-emerald-500/25"
                    : "border-hairline bg-card text-body hover:border-emerald-400/70 hover:text-headline",
                )}
              >
                <span className="max-w-[190px] truncate">{v.value}</span>
                <span className="tabular text-[10px] font-extrabold text-muted">{v.count}</span>
              </Link>
            );
          })}
          {hidden > 0 ? (
            <button
              onClick={() => setExpanded(dim.key)}
              className="rounded-lg border border-dashed border-hairline px-2.5 py-1.5 text-[12px] font-bold text-muted transition-colors hover:border-emerald-400/60 hover:text-headline"
            >
              +{hidden} more
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">
          Options
        </span>
        {active ? (
          <span className="text-[11px] font-extrabold text-[var(--dw-green-mid)]">
            {matched} review{matched === 1 ? "" : "s"} match
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-muted">
            {options.variants.length || swatches.length} variant
            {(options.variants.length || swatches.length) === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* ---------- colour: pictures, the way a store shows them ---------- */}
      {(swatches.length > 0 || currentColour || colourDim) && (
        <div className="mt-4">
          <span className="text-[12.5px] font-extrabold text-headline">Colour:</span>

          {swatches.length > 0 ? (
            <div className="mt-2 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {currentColour && currentImageUrl ? (
                <span className="w-[92px] shrink-0">
                  <span className="relative block h-[78px] w-[92px] overflow-hidden rounded-xl border-2 border-emerald-500 bg-subtle">
                    <Image
                      src={currentImageUrl}
                      alt={currentColour}
                      fill
                      sizes="92px"
                      className="object-contain p-1.5"
                      unoptimized
                    />
                  </span>
                  <span className="mt-1 block truncate text-[10.5px] font-bold text-headline">
                    {currentColour}
                  </span>
                  <span className="block text-[10px] font-semibold text-[var(--dw-green-mid)]">
                    This one
                  </span>
                </span>
              ) : null}

              {swatches.map((s) => (
                <Link
                  key={s.slug}
                  href={s.href}
                  className="group w-[92px] shrink-0"
                  title={s.title}
                >
                  <span className="relative block h-[78px] w-[92px] overflow-hidden rounded-xl border border-hairline bg-subtle transition-colors group-hover:border-emerald-400/70">
                    {s.imageUrl ? (
                      <Image
                        src={s.imageUrl}
                        alt={s.colour ?? s.title}
                        fill
                        sizes="92px"
                        className="object-contain p-1.5"
                        unoptimized
                      />
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-[10.5px] font-bold text-body group-hover:text-headline">
                    {s.colour ?? s.title}
                  </span>
                  <span className="block text-[10px] font-semibold text-muted">
                    {formatINR(s.price)}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {/* no sibling photos — fall back to the colour names we read */}
          {!swatches.length && colourDim ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {colourDim.values.slice(0, 12).map((v) => {
                const on = active?.key === "colour" && active?.value === v.value;
                const href = `/product/${slug}?opt=${encodeURIComponent(
                  `colour:${v.value}`,
                )}#reviews`;
                return (
                  <Link
                    key={v.value}
                    href={href}
                    scroll={false}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                      on
                        ? "border-emerald-500/60 bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)] ring-1 ring-emerald-500/25"
                        : "border-hairline bg-card text-body hover:border-emerald-400/70 hover:text-headline",
                    )}
                  >
                    <span className="max-w-[190px] truncate">{v.value}</span>
                    <span className="tabular text-[10px] font-extrabold text-muted">{v.count}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* ---------- size, style, configuration ---------- */}
      {otherDims.length > 0 ? (
        <div className="mt-4 space-y-3.5">
          {otherDims.map(chipRow)}
        </div>
      ) : null}

      {active ? (
        <Link
          href={`/product/${slug}#reviews`}
          scroll={false}
          className="mt-4 inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--dw-green-mid)] hover:underline"
        >
          Clear filter — show every variant
        </Link>
      ) : null}
    </section>
  );
}
