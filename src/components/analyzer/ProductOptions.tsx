"use client";

import Link from "next/link";
import { useState } from "react";
import { Palette, Ruler, SlidersHorizontal } from "lucide-react";
import type { ProductOptions as Options } from "@/lib/db/variants";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Palette> = {
  colour: Palette,
  size: Ruler,
  configuration: SlidersHorizontal,
  styleName: SlidersHorizontal,
};

/** How many chips to show before we hide the tail. */
const CAP = 7;

function iconFor(key: string) {
  return ICONS[key] ?? SlidersHorizontal;
}

/**
 * The product's real options — the colours, sizes and configurations that
 * actually exist for it, read off the store's own review data.
 *
 * Picking one filters the customer reviews below to that exact variant, so
 * you can read what buyers of *that* colour said.
 */
export function ProductOptions({
  options,
  slug,
  active,
  matched,
}: {
  options: Options;
  slug: string;
  active: { key: string; value: string } | null;
  matched: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!options.dimensions.length) return null;

  return (
    <section className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">
          Options
        </span>
        {active ? (
          <span className="text-[11px] font-extrabold text-[var(--dw-green-mid)]">
            {matched} review{matched === 1 ? "" : "s"} match
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-muted">
            {options.variants.length} variant{options.variants.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {options.dimensions.map((dim) => {
          const Icon = iconFor(dim.key);
          const isActiveDim = active?.key === dim.key;
          const shown = expanded === dim.key ? dim.values : dim.values.slice(0, CAP);
          const hidden = dim.values.length - shown.length;
          return (
            <div key={dim.key}>
              <div className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-muted" />
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-secondary">
                  {dim.label}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-bold transition-colors",
                        on
                          ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)]"
                          : "border-hairline bg-subtle text-body hover:border-emerald-400/60 hover:text-headline",
                      )}
                    >
                      <span className="max-w-[150px] truncate">{v.value}</span>
                      <span className="tabular text-[10px] font-extrabold text-muted">
                        {v.count}
                      </span>
                    </Link>
                  );
                })}
                {hidden > 0 ? (
                  <button
                    onClick={() => setExpanded(dim.key)}
                    className="rounded-lg border border-dashed border-hairline px-2 py-1 text-[11.5px] font-bold text-muted transition-colors hover:border-emerald-400/60 hover:text-headline"
                  >
                    +{hidden} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {active ? (
        <Link
          href={`/product/${slug}#reviews`}
          scroll={false}
          className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--dw-green-mid)] hover:underline"
        >
          Clear filter — show every variant
        </Link>
      ) : null}
    </section>
  );
}
