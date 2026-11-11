"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronDown, Layers, RotateCcw } from "lucide-react";
import type { SetupAlternative, SetupItem } from "@/lib/setups/engine";
import type { Verdict } from "@/lib/types";
import { cn, formatINR } from "@/lib/utils";

const VERDICT_STYLE: Record<Verdict, string> = {
  BUY: "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--verdict-buy)]",
  FAIR: "border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  WAIT: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  AVOID: "border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300",
  INSUFFICIENT: "border-hairline bg-elevated text-secondary",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  BUY: "Buy",
  FAIR: "Fair",
  WAIT: "Wait",
  AVOID: "Avoid",
  INSUFFICIENT: "Learning",
};

type Part = SetupItem | SetupAlternative;

/** A stable date for the newest recorded price, never a relative countdown. */
function recordDate(ts: number | null): string {
  if (!ts) return "no record date";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function deltaLabel(part: Part, current: Part): string {
  const delta = Math.round(part.price - current.price);
  if (delta === 0) return "same price";
  return delta < 0
    ? `${formatINR(Math.abs(delta))} less than the current pick`
    : `${formatINR(delta)} more than the current pick`;
}

/**
 * "Other tracked options" for one filled slot.
 *
 * The comparison uses only fields the builder already recorded: the store's
 * price, the same verdict as the product page, the recorded low and median,
 * and the date of the newest point. With one genuine candidate the panel says
 * so instead of padding a shortlist.
 */
export function SetupAlternatives({
  item,
  defaultItem,
  swapped,
  error,
  onSwap,
  onReset,
}: {
  item: SetupItem;
  defaultItem: SetupItem;
  swapped: boolean;
  error: string | null;
  onSwap: (listingId: string) => void;
  onReset: () => void;
}) {
  const alternatives = item.alternatives.filter((a) => a.listingId !== item.listingId);
  const otherCount = alternatives.length + (swapped ? 1 : 0);

  if (!swapped && otherCount === 0) {
    return (
      <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-hairline-soft bg-subtle px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-muted">
        <Layers className="mt-px h-3 w-3 shrink-0" />
        Only one tracked listing fits this slot at this tier and budget — no alternatives to compare.
      </p>
    );
  }

  const rows: { part: Part; label: string; isCurrent: boolean }[] = [
    { part: item, label: "Current pick", isCurrent: true },
    ...(swapped ? [{ part: defaultItem, label: "Recommended", isCurrent: false }] : []),
    ...alternatives.map((a) => ({ part: a, label: "Option", isCurrent: false })),
  ];

  return (
    <details className="group mt-3 rounded-lg border border-hairline-soft bg-subtle">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[10.5px] font-extrabold text-secondary marker:hidden hover:text-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--dw-green-mid)]" />
          {otherCount === 1
            ? "1 other tracked option"
            : `${otherCount} other tracked options`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-hairline-soft px-2.5 py-2.5">
        {swapped && (
          <button
            type="button"
            onClick={onReset}
            className="mb-2 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 text-[10.5px] font-extrabold text-[var(--dw-green-mid)] hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore the recommended pick
          </button>
        )}

        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={`${row.label}-${row.part.listingId}`}
              className={cn(
                "rounded-lg border bg-card px-2.5 py-2",
                row.isCurrent ? "border-[var(--dw-green-border)]" : "border-hairline",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider",
                    row.isCurrent
                      ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                      : "border-hairline bg-subtle text-muted",
                  )}
                >
                  {row.label}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider",
                    VERDICT_STYLE[row.part.verdict],
                  )}
                >
                  {VERDICT_LABEL[row.part.verdict]}
                </span>
                <span className="tabular ml-auto text-[12.5px] font-extrabold text-headline">
                  {formatINR(row.part.price)}
                </span>
              </div>

              {!row.isCurrent ? (
                <div
                  className={cn(
                    "mt-1 text-[9.5px] font-bold",
                    row.part.price < item.price ? "text-[var(--dw-green-mid)]" : "text-muted",
                  )}
                >
                  {deltaLabel(row.part, item)}
                </div>
              ) : null}

              <div className="mt-1 line-clamp-2 text-[10.5px] font-bold leading-snug text-headline">
                {row.part.title}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-semibold text-muted">
                <span>
                  low{" "}
                  {row.part.historicalLow !== null
                    ? formatINR(row.part.historicalLow)
                    : "—"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  median{" "}
                  {row.part.historicalMedian !== null
                    ? formatINR(row.part.historicalMedian)
                    : "—"}
                </span>
                <span aria-hidden>·</span>
                <span>recorded {recordDate(row.part.observedAt)}</span>
                <span aria-hidden>·</span>
                <span>{row.part.observationCount} points</span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/product/${row.part.slug}`}
                  className="inline-flex min-h-[40px] items-center gap-1 text-[10px] font-extrabold text-[var(--dw-green-mid)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                >
                  Price history
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
                {row.isCurrent ? (
                  <span className="text-[9.5px] font-bold text-muted">In the build</span>
                ) : row.label === "Recommended" ? (
                  <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex min-h-[40px] items-center rounded-lg border border-hairline bg-card px-2.5 text-[10px] font-extrabold text-secondary hover:text-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSwap(row.part.listingId)}
                    className="inline-flex min-h-[40px] items-center rounded-lg border border-emerald-600/35 bg-[var(--dw-green-surface)] px-2.5 text-[10px] font-extrabold text-[var(--dw-green-mid)] hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  >
                    Swap in
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] px-2.5 py-2 text-[9.5px] font-semibold leading-relaxed text-amber-700 dark:text-amber-300"
          >
            {error}
          </p>
        )}

        <p className="mt-2 text-[9px] leading-relaxed text-muted">
          Swaps use recorded prices, never estimates. A combination the parts cannot support is
          refused with the reason.
        </p>
      </div>
    </details>
  );
}
